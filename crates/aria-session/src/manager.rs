use crate::{
    local_pty::LocalPtyTransport,
    scrollback::{ScrollbackBuffer, ScrollbackPage},
    transport::Transport,
};
use anyhow::{anyhow, Context, Result};
use aria_ipc::{
    AttachViewerRequest, AttachViewerResponse, BufferKind, CreateLocalSessionRequest,
    CreateLocalSessionResponse, DetachViewerRequest, EmptyResponse, ListSessionsRequest,
    ListSessionsResponse, ReadScrollbackRequest, ReadScrollbackResponse, RehydrateReason,
    RenameSessionRequest, ReplayMode, ScrollbackLine, ScrollbackStats, SessionMetadata,
    SessionMetadataDelta, SessionResizeRequest, SessionSelector, SessionSnapshot,
    SessionStreamFrame, SessionStreamMetadata, SessionSummary, SessionWriteRequest,
    SetSessionBackgroundRequest, ViewerAckRequest, ViewerDetachedReason, ViewerRole,
};
use aria_model::{SessionId, SessionStatus, TerminalSize, ViewerId};
use aria_terminal::{TerminalEngine, Vt100TerminalEngine};
use std::{
    collections::{HashMap, VecDeque},
    io::Read,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::{mpsc, oneshot, RwLock};
use tokio::time::{sleep, Duration};
use tracing::warn;

const DEFAULT_SCROLLBACK_LINES: usize = 50_000;
const DEFAULT_REHYDRATE_SCROLLBACK_LINES: usize = 200;
const REPLAY_LOG_CAPACITY_BYTES: usize = 4 * 1024 * 1024;
const STARTUP_SNAPSHOT_TIMEOUT_MS: u64 = 1_500;
const STARTUP_SNAPSHOT_POLL_INTERVAL_MS: u64 = 25;

#[derive(Clone, Default)]
pub struct SessionManager {
    sessions: Arc<RwLock<HashMap<SessionId, SessionHandle>>>,
}

#[derive(Clone)]
struct SessionHandle {
    sender: mpsc::Sender<SessionCommand>,
}

enum SessionCommand {
    Write(Vec<u8>, oneshot::Sender<Result<()>>),
    Resize(TerminalSize, oneshot::Sender<Result<()>>),
    Snapshot(oneshot::Sender<Result<SessionSnapshot>>),
    Metadata(oneshot::Sender<Result<SessionMetadata>>),
    Summary(oneshot::Sender<Result<SessionSummary>>),
    AttachViewer {
        request: AttachViewerRequest,
        stream: mpsc::UnboundedSender<SessionStreamFrame>,
        reply: oneshot::Sender<Result<AttachViewerResponse>>,
    },
    DetachViewer(DetachViewerRequest, oneshot::Sender<Result<SessionId>>),
    ViewerAck(ViewerAckRequest, oneshot::Sender<Result<()>>),
    ReadScrollback(
        ReadScrollbackRequest,
        oneshot::Sender<Result<ReadScrollbackResponse>>,
    ),
    Shutdown(oneshot::Sender<Result<()>>),
    ShutdownIfNoViewers(oneshot::Sender<Result<bool>>),
    Rename(String, oneshot::Sender<Result<()>>),
    SetBackground(bool, oneshot::Sender<Result<()>>),
    ProcessOutput(Vec<u8>),
    ProcessExit(Option<u32>),
}

struct SessionActor {
    session_id: SessionId,
    transport: Box<dyn Transport>,
    terminal: Box<dyn TerminalEngine>,
    metadata: SessionMetadata,
    scrollback: ScrollbackBuffer,
    pending_terminal_query: Vec<u8>,
    viewers: HashMap<ViewerId, ViewerState>,
    event_seq: u64,
    replay_log: ReplayLog,
}

struct ViewerState {
    role: ViewerRole,
    _viewport: TerminalSize,
    rehydrate_scrollback_lines: usize,
    sender: mpsc::UnboundedSender<SessionStreamFrame>,
    last_ack_seq: u64,
}

#[derive(Clone)]
struct ReplayRecord {
    seq: u64,
    payload: ReplayPayload,
    size_bytes: usize,
}

#[derive(Clone)]
enum ReplayPayload {
    Rehydrate {
        reason: RehydrateReason,
        active_buffer: BufferKind,
        size: TerminalSize,
        vt_payload: Vec<u8>,
        metadata: SessionStreamMetadata,
    },
    Bytes(Vec<u8>),
    Metadata(SessionMetadataDelta),
}

struct ReplayLog {
    capacity_bytes: usize,
    size_bytes: usize,
    records: VecDeque<ReplayRecord>,
}

impl SessionManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn create_local(
        &self,
        request: CreateLocalSessionRequest,
        title_override: Option<String>,
    ) -> Result<CreateLocalSessionResponse> {
        let session_id = SessionId::new();
        let created_at = unix_timestamp();
        let spawn = LocalPtyTransport::spawn(&request)?;
        let title = title_override.unwrap_or_else(|| {
            spawn
                .command
                .first()
                .cloned()
                .unwrap_or_else(|| "shell".to_string())
        });
        let metadata = SessionMetadata {
            session_id,
            title,
            status: SessionStatus::Running,
            transport: spawn.transport.metadata().kind,
            size: request.size,
            created_at: created_at.clone(),
            updated_at: created_at.clone(),
            cwd: spawn.cwd.clone(),
            command: spawn.command.clone(),
            shell: spawn.shell,
            process_id: spawn.transport.metadata().process_id,
            exit_code: None,
        };
        let actor = SessionActor {
            session_id,
            transport: Box::new(spawn.transport),
            terminal: Box::new(Vt100TerminalEngine::new(
                request.size,
                DEFAULT_SCROLLBACK_LINES,
            )),
            metadata,
            scrollback: ScrollbackBuffer::new(DEFAULT_SCROLLBACK_LINES),
            pending_terminal_query: Vec::new(),
            viewers: HashMap::new(),
            event_seq: 0,
            replay_log: ReplayLog::new(REPLAY_LOG_CAPACITY_BYTES),
        };
        let (sender, receiver) = mpsc::channel(64);
        self.sessions.write().await.insert(
            session_id,
            SessionHandle {
                sender: sender.clone(),
            },
        );
        tokio::spawn(run_session_actor(actor, receiver));
        spawn_output_reader(spawn.reader, sender.clone());
        spawn_child_waiter(spawn.child, sender);
        self.wait_for_renderable_snapshot(session_id).await;
        let summary = self
            .get_summary(session_id)
            .await
            .context("load created session summary")?;
        Ok(CreateLocalSessionResponse {
            session_id,
            summary,
        })
    }

    pub async fn list(&self, _request: ListSessionsRequest) -> Result<ListSessionsResponse> {
        let handles = self.sessions.read().await.clone();
        let mut sessions = Vec::with_capacity(handles.len());
        let mut stale = Vec::new();
        for (session_id, handle) in handles {
            match request_summary(&handle).await {
                Ok(summary) => sessions.push(summary),
                Err(error) => {
                    warn!(%session_id, error = %error, "dropping stale session handle");
                    stale.push(session_id);
                }
            }
        }
        if !stale.is_empty() {
            let mut guard = self.sessions.write().await;
            for session_id in stale {
                guard.remove(&session_id);
            }
        }
        sessions.sort_by(|left, right| left.created_at.cmp(&right.created_at));
        Ok(ListSessionsResponse { sessions })
    }

    pub async fn snapshot(&self, selector: SessionSelector) -> Result<SessionSnapshot> {
        let handle = self.handle(selector.session_id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        handle
            .sender
            .send(SessionCommand::Snapshot(reply_tx))
            .await
            .map_err(|_| anyhow!("session actor is unavailable"))?;
        reply_rx
            .await
            .map_err(|_| anyhow!("session actor dropped"))?
    }

    pub async fn metadata(&self, selector: SessionSelector) -> Result<SessionMetadata> {
        let handle = self.handle(selector.session_id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        handle
            .sender
            .send(SessionCommand::Metadata(reply_tx))
            .await
            .map_err(|_| anyhow!("session actor is unavailable"))?;
        reply_rx
            .await
            .map_err(|_| anyhow!("session actor dropped"))?
    }

    pub async fn write(&self, request: SessionWriteRequest) -> Result<EmptyResponse> {
        let handle = self.handle(request.session_id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        handle
            .sender
            .send(SessionCommand::Write(request.data.into_bytes(), reply_tx))
            .await
            .map_err(|_| anyhow!("session actor is unavailable"))?;
        reply_rx
            .await
            .map_err(|_| anyhow!("session actor dropped"))??;
        Ok(EmptyResponse {})
    }

    pub async fn resize(&self, request: SessionResizeRequest) -> Result<EmptyResponse> {
        let handle = self.handle(request.session_id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        handle
            .sender
            .send(SessionCommand::Resize(request.size, reply_tx))
            .await
            .map_err(|_| anyhow!("session actor is unavailable"))?;
        reply_rx
            .await
            .map_err(|_| anyhow!("session actor dropped"))??;
        Ok(EmptyResponse {})
    }

    pub async fn attach_viewer(
        &self,
        request: AttachViewerRequest,
    ) -> Result<(
        AttachViewerResponse,
        mpsc::UnboundedReceiver<SessionStreamFrame>,
    )> {
        let handle = self.handle(request.session_id).await?;
        let (stream_tx, stream_rx) = mpsc::unbounded_channel();
        let (reply_tx, reply_rx) = oneshot::channel();
        handle
            .sender
            .send(SessionCommand::AttachViewer {
                request,
                stream: stream_tx,
                reply: reply_tx,
            })
            .await
            .map_err(|_| anyhow!("session actor is unavailable"))?;
        let response = reply_rx
            .await
            .map_err(|_| anyhow!("session actor dropped"))??;
        Ok((response, stream_rx))
    }

    pub async fn detach_viewer_with_session(
        &self,
        request: DetachViewerRequest,
    ) -> Result<SessionId> {
        let viewer_id = request.viewer_id;
        self.with_viewer(request.viewer_id, move |handle| async move {
            let (reply_tx, reply_rx) = oneshot::channel();
            handle
                .sender
                .send(SessionCommand::DetachViewer(
                    DetachViewerRequest {
                        viewer_id,
                        close_session_if_unused: false,
                    },
                    reply_tx,
                ))
                .await
                .map_err(|_| anyhow!("session actor is unavailable"))?;
            reply_rx
                .await
                .map_err(|_| anyhow!("session actor dropped"))?
        })
        .await
    }

    pub async fn detach_viewer(&self, request: DetachViewerRequest) -> Result<EmptyResponse> {
        self.detach_viewer_with_session(request).await?;
        Ok(EmptyResponse {})
    }

    pub async fn close_if_no_viewers(&self, session_id: SessionId) -> Result<bool> {
        let Some(handle) = self.sessions.write().await.remove(&session_id) else {
            return Ok(false);
        };
        let (reply_tx, reply_rx) = oneshot::channel();
        if handle
            .sender
            .send(SessionCommand::ShutdownIfNoViewers(reply_tx))
            .await
            .is_err()
        {
            return Ok(false);
        }
        let result = match reply_rx.await {
            Ok(result) => result,
            Err(_) => return Ok(false),
        };
        match result {
            Ok(true) => Ok(true),
            Ok(false) => {
                self.sessions.write().await.insert(session_id, handle);
                Ok(false)
            }
            Err(error) => {
                self.sessions.write().await.insert(session_id, handle);
                Err(error)
            }
        }
    }

    pub async fn viewer_ack(&self, request: ViewerAckRequest) -> Result<EmptyResponse> {
        let viewer_id = request.viewer_id;
        let seq = request.seq;
        self.with_viewer(request.viewer_id, move |handle| async move {
            let (reply_tx, reply_rx) = oneshot::channel();
            handle
                .sender
                .send(SessionCommand::ViewerAck(
                    ViewerAckRequest { viewer_id, seq },
                    reply_tx,
                ))
                .await
                .map_err(|_| anyhow!("session actor is unavailable"))?;
            reply_rx
                .await
                .map_err(|_| anyhow!("session actor dropped"))?
        })
        .await?;
        Ok(EmptyResponse {})
    }

    pub async fn read_scrollback(
        &self,
        request: ReadScrollbackRequest,
    ) -> Result<ReadScrollbackResponse> {
        let handle = self.handle(request.session_id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        handle
            .sender
            .send(SessionCommand::ReadScrollback(request, reply_tx))
            .await
            .map_err(|_| anyhow!("session actor is unavailable"))?;
        reply_rx
            .await
            .map_err(|_| anyhow!("session actor dropped"))?
    }

    pub async fn close(&self, selector: SessionSelector) -> Result<EmptyResponse> {
        let handle = self
            .sessions
            .write()
            .await
            .remove(&selector.session_id)
            .ok_or_else(|| anyhow!("unknown session {}", selector.session_id))?;
        let (reply_tx, reply_rx) = oneshot::channel();
        if handle
            .sender
            .send(SessionCommand::Shutdown(reply_tx))
            .await
            .is_err()
        {
            return Err(anyhow!("session actor is unavailable"));
        }
        let result = match reply_rx.await {
            Ok(result) => result,
            Err(_) => {
                return Err(anyhow!("session actor dropped"));
            }
        };
        if let Err(error) = result {
            self.sessions
                .write()
                .await
                .insert(selector.session_id, handle);
            return Err(error);
        }
        Ok(EmptyResponse {})
    }

    pub async fn rename(&self, request: RenameSessionRequest) -> Result<EmptyResponse> {
        let handle = self.handle(request.session_id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        handle
            .sender
            .send(SessionCommand::Rename(request.title, reply_tx))
            .await
            .map_err(|_| anyhow!("session actor is unavailable"))?;
        reply_rx
            .await
            .map_err(|_| anyhow!("session actor dropped"))??;
        Ok(EmptyResponse {})
    }

    pub async fn set_background(
        &self,
        request: SetSessionBackgroundRequest,
    ) -> Result<EmptyResponse> {
        let handle = self.handle(request.session_id).await?;
        let (reply_tx, reply_rx) = oneshot::channel();
        handle
            .sender
            .send(SessionCommand::SetBackground(request.background, reply_tx))
            .await
            .map_err(|_| anyhow!("session actor is unavailable"))?;
        reply_rx
            .await
            .map_err(|_| anyhow!("session actor dropped"))??;
        Ok(EmptyResponse {})
    }

    async fn get_summary(&self, session_id: SessionId) -> Result<SessionSummary> {
        let handle = self.handle(session_id).await?;
        request_summary(&handle).await
    }

    async fn handle(&self, session_id: SessionId) -> Result<SessionHandle> {
        self.sessions
            .read()
            .await
            .get(&session_id)
            .cloned()
            .ok_or_else(|| anyhow!("unknown session {}", session_id))
    }

    async fn with_viewer<F, Fut, T>(&self, viewer_id: ViewerId, f: F) -> Result<T>
    where
        F: Fn(SessionHandle) -> Fut,
        Fut: std::future::Future<Output = Result<T>>,
    {
        let handles = self.sessions.read().await.clone();
        let mut last_error = None;
        for handle in handles.into_values() {
            match f(handle).await {
                Ok(value) => return Ok(value),
                Err(error) if error.to_string().contains("unknown viewer") => {
                    last_error = Some(error);
                }
                Err(error) => return Err(error),
            }
        }
        Err(last_error.unwrap_or_else(|| anyhow!("unknown viewer {}", viewer_id)))
    }

    async fn wait_for_renderable_snapshot(&self, session_id: SessionId) {
        let deadline =
            tokio::time::Instant::now() + Duration::from_millis(STARTUP_SNAPSHOT_TIMEOUT_MS);
        loop {
            let snapshot = match self.snapshot(SessionSelector { session_id }).await {
                Ok(snapshot) => snapshot,
                Err(_) => return,
            };
            if snapshot.metadata.status != SessionStatus::Running
                || snapshot_is_renderable(&snapshot)
            {
                return;
            }
            if tokio::time::Instant::now() >= deadline {
                return;
            }
            sleep(Duration::from_millis(STARTUP_SNAPSHOT_POLL_INTERVAL_MS)).await;
        }
    }
}

async fn request_summary(handle: &SessionHandle) -> Result<SessionSummary> {
    let (reply_tx, reply_rx) = oneshot::channel();
    handle
        .sender
        .send(SessionCommand::Summary(reply_tx))
        .await
        .map_err(|_| anyhow!("session actor is unavailable"))?;
    reply_rx
        .await
        .map_err(|_| anyhow!("session actor dropped"))?
}

struct OutputEffects {
    transport_replies: Vec<Vec<u8>>,
    stream_bytes: Vec<Vec<u8>>,
}

async fn run_session_actor(mut actor: SessionActor, mut receiver: mpsc::Receiver<SessionCommand>) {
    while let Some(command) = receiver.recv().await {
        match command {
            SessionCommand::Write(data, reply) => {
                let result = async {
                    actor.transport.write(&data).await?;
                    actor.metadata.updated_at = unix_timestamp();
                    Ok(())
                }
                .await;
                let _ = reply.send(result);
            }
            SessionCommand::Resize(size, reply) => {
                let _ = reply.send(actor.resize(size).await);
            }
            SessionCommand::Snapshot(reply) => {
                let _ = reply.send(Ok(actor.snapshot()));
            }
            SessionCommand::Metadata(reply) => {
                let _ = reply.send(Ok(actor.metadata.clone()));
            }
            SessionCommand::Summary(reply) => {
                let _ = reply.send(Ok(to_summary(&actor.metadata)));
            }
            SessionCommand::AttachViewer {
                request,
                stream,
                reply,
            } => {
                let _ = reply.send(actor.attach_viewer(request, stream).await);
            }
            SessionCommand::DetachViewer(request, reply) => {
                let _ = reply.send(actor.detach_viewer(request.viewer_id));
            }
            SessionCommand::ViewerAck(request, reply) => {
                let _ = reply.send(actor.viewer_ack(request.viewer_id, request.seq));
            }
            SessionCommand::ReadScrollback(request, reply) => {
                let _ = reply.send(Ok(actor.read_scrollback(request)));
            }
            SessionCommand::Shutdown(reply) => {
                let result = actor.shutdown().await;
                let should_exit = result.is_ok();
                let _ = reply.send(result);
                if should_exit {
                    break;
                }
            }
            SessionCommand::ShutdownIfNoViewers(reply) => {
                let result = actor.shutdown_if_no_viewers().await;
                let should_exit = matches!(result, Ok(true));
                let _ = reply.send(result);
                if should_exit {
                    break;
                }
            }
            SessionCommand::Rename(title, reply) => {
                let _ = reply.send(actor.rename(title));
            }
            SessionCommand::SetBackground(background, reply) => {
                let _ = reply.send(actor.set_background(background));
            }
            SessionCommand::ProcessOutput(bytes) => {
                let normalized = normalize_terminal_output(&bytes);
                let output = actor.process_terminal_output(&normalized);
                for reply in output.transport_replies {
                    if let Err(error) = actor.transport.write(&reply).await {
                        warn!(%actor.session_id, error = %error, "failed to send terminal reply");
                    }
                }
                for bytes in output.stream_bytes {
                    actor.emit_bytes(bytes);
                }
                actor.metadata.updated_at = unix_timestamp();
            }
            SessionCommand::ProcessExit(code) => {
                actor.process_exit(code);
            }
        }
    }
}

impl SessionActor {
    async fn attach_viewer(
        &mut self,
        mut request: AttachViewerRequest,
        stream: mpsc::UnboundedSender<SessionStreamFrame>,
    ) -> Result<AttachViewerResponse> {
        if request.rehydrate_scrollback_lines.is_none() {
            request.rehydrate_scrollback_lines = Some(DEFAULT_REHYDRATE_SCROLLBACK_LINES);
        }
        let rehydrate_scrollback_lines = request
            .rehydrate_scrollback_lines
            .unwrap_or(DEFAULT_REHYDRATE_SCROLLBACK_LINES);
        let accepted_role = if request.role == ViewerRole::Interactive
            && self
                .viewers
                .values()
                .any(|viewer| viewer.role == ViewerRole::Interactive)
        {
            ViewerRole::Observer
        } else {
            request.role
        };
        if accepted_role == ViewerRole::Interactive && request.viewport != self.metadata.size {
            self.transport.resize(request.viewport).await?;
            self.terminal.resize(request.viewport);
            self.metadata.size = request.viewport;
            self.metadata.updated_at = unix_timestamp();
        }
        let viewer_id = ViewerId::new();
        self.viewers.insert(
            viewer_id,
            ViewerState {
                role: accepted_role,
                _viewport: request.viewport,
                rehydrate_scrollback_lines,
                sender: stream,
                last_ack_seq: request.replay_from_seq.unwrap_or(0),
            },
        );
        let (replay_mode, next_expected_seq) =
            if let Some(replay_from_seq) = request.replay_from_seq {
                match self
                    .replay_log
                    .replay_after(replay_from_seq, self.event_seq)
                {
                    Some(records) => {
                        for record in records {
                            self.send_record_to_viewer(viewer_id, &record)?;
                        }
                        (ReplayMode::Bytes, replay_from_seq.saturating_add(1))
                    }
                    None => {
                        let next = self.event_seq.saturating_add(1);
                        self.emit_rehydrate_to_viewer(
                            viewer_id,
                            RehydrateReason::ReplayGap,
                            rehydrate_scrollback_lines,
                        )?;
                        (ReplayMode::Rehydrate, next)
                    }
                }
            } else {
                let next = self.event_seq.saturating_add(1);
                self.emit_rehydrate_to_viewer(
                    viewer_id,
                    RehydrateReason::Attach,
                    rehydrate_scrollback_lines,
                )?;
                (ReplayMode::Rehydrate, next)
            };
        Ok(AttachViewerResponse {
            viewer_id,
            session_id: self.session_id,
            accepted_role,
            replay_mode,
            next_expected_seq,
        })
    }

    fn detach_viewer(&mut self, viewer_id: ViewerId) -> Result<SessionId> {
        self.viewers
            .remove(&viewer_id)
            .map(|_| self.session_id)
            .ok_or_else(|| anyhow!("unknown viewer {}", viewer_id))
    }

    fn viewer_ack(&mut self, viewer_id: ViewerId, seq: u64) -> Result<()> {
        let viewer = self
            .viewers
            .get_mut(&viewer_id)
            .ok_or_else(|| anyhow!("unknown viewer {}", viewer_id))?;
        viewer.last_ack_seq = seq;
        Ok(())
    }

    fn read_scrollback(&self, request: ReadScrollbackRequest) -> ReadScrollbackResponse {
        page_to_response(
            self.session_id,
            self.scrollback.read(request.before_line_id, request.limit),
        )
    }

    async fn resize(&mut self, size: TerminalSize) -> Result<()> {
        self.transport.resize(size).await?;
        self.terminal.resize(size);
        self.metadata.size = size;
        self.metadata.updated_at = unix_timestamp();
        if !self.viewers.is_empty() {
            self.emit_rehydrate(RehydrateReason::Resize);
        }
        Ok(())
    }

    async fn shutdown(&mut self) -> Result<()> {
        if !matches!(
            self.metadata.status,
            SessionStatus::Exited | SessionStatus::Closed | SessionStatus::Failed
        ) {
            if let Err(error) = self.transport.shutdown().await {
                warn!(
                    %self.session_id,
                    error = %error,
                    "transport shutdown failed while closing session"
                );
            }
        }
        self.metadata.status = SessionStatus::Closed;
        self.metadata.updated_at = unix_timestamp();
        self.notify_detached(ViewerDetachedReason::SessionClosed);
        Ok(())
    }

    async fn shutdown_if_no_viewers(&mut self) -> Result<bool> {
        if !self.viewers.is_empty() {
            return Ok(false);
        }
        if self.metadata.status == SessionStatus::Background {
            return Ok(false);
        }
        self.shutdown().await?;
        Ok(true)
    }

    fn process_exit(&mut self, code: Option<u32>) {
        self.metadata.status = SessionStatus::Exited;
        self.metadata.exit_code = code;
        self.metadata.updated_at = unix_timestamp();
        self.emit_metadata(SessionMetadataDelta {
            title: None,
            status: Some(SessionStatus::Exited),
            cwd: None,
            shell: None,
            process_id: None,
            exit_code: code,
        });
    }

    fn process_terminal_output(&mut self, bytes: &[u8]) -> OutputEffects {
        const CPR_QUERY: &[u8] = b"\x1b[6n";
        let mut combined = Vec::with_capacity(self.pending_terminal_query.len() + bytes.len());
        combined.extend_from_slice(&self.pending_terminal_query);
        combined.extend_from_slice(bytes);
        self.pending_terminal_query.clear();
        let mut transport_replies = Vec::new();
        let mut stream_bytes = Vec::new();
        let mut chunk_start = 0;
        let mut index = 0;
        while index < combined.len() {
            if combined[index..].starts_with(CPR_QUERY) {
                self.process_terminal_chunk(&combined[chunk_start..index], &mut stream_bytes);
                transport_replies.push(cursor_position_reply(self.terminal.snapshot().cursor));
                index += CPR_QUERY.len();
                chunk_start = index;
                continue;
            }
            if combined[index] == 0x1b {
                let remaining = &combined[index..];
                if CPR_QUERY.starts_with(remaining) && remaining.len() < CPR_QUERY.len() {
                    self.process_terminal_chunk(&combined[chunk_start..index], &mut stream_bytes);
                    self.pending_terminal_query.extend_from_slice(remaining);
                    return OutputEffects {
                        transport_replies,
                        stream_bytes,
                    };
                }
            }
            index += 1;
        }
        self.process_terminal_chunk(&combined[chunk_start..], &mut stream_bytes);
        OutputEffects {
            transport_replies,
            stream_bytes,
        }
    }

    fn process_terminal_chunk(&mut self, bytes: &[u8], stream_bytes: &mut Vec<Vec<u8>>) {
        if bytes.is_empty() {
            return;
        }
        self.terminal.process(bytes);
        self.capture_terminal_title();
        self.scrollback.ingest(bytes);
        stream_bytes.push(bytes.to_vec());
    }

    fn capture_terminal_title(&mut self) {
        let Some(title) = self.terminal.take_recent_title() else {
            return;
        };
        if title.is_empty() || title == self.metadata.title {
            return;
        }
        self.metadata.title = title.clone();
        self.emit_metadata(SessionMetadataDelta {
            title: Some(title),
            status: None,
            cwd: None,
            shell: None,
            process_id: None,
            exit_code: None,
        });
    }

    fn rename(&mut self, title: String) -> Result<()> {
        if title.is_empty() {
            return Err(anyhow!("title cannot be empty"));
        }
        if title == self.metadata.title {
            return Ok(());
        }
        self.metadata.title = title.clone();
        self.metadata.updated_at = unix_timestamp();
        self.emit_metadata(SessionMetadataDelta {
            title: Some(title),
            status: None,
            cwd: None,
            shell: None,
            process_id: None,
            exit_code: None,
        });
        Ok(())
    }

    fn set_background(&mut self, background: bool) -> Result<()> {
        let next_status = if background {
            SessionStatus::Background
        } else {
            SessionStatus::Running
        };
        if self.metadata.status == next_status {
            return Ok(());
        }
        if !matches!(
            self.metadata.status,
            SessionStatus::Running | SessionStatus::Background
        ) {
            return Err(anyhow!(
                "cannot change background mode for {:?} session",
                self.metadata.status
            ));
        }

        self.metadata.status = next_status;
        self.metadata.updated_at = unix_timestamp();
        self.emit_metadata(SessionMetadataDelta {
            title: None,
            status: Some(next_status),
            cwd: None,
            shell: None,
            process_id: None,
            exit_code: None,
        });
        Ok(())
    }

    fn snapshot(&self) -> SessionSnapshot {
        let terminal = self.terminal.snapshot();
        SessionSnapshot {
            session_id: self.session_id,
            size: terminal.size,
            visible_lines: terminal.visible_lines,
            cursor: terminal.cursor,
            alternate_screen: terminal.alternate_screen,
            scrollback: ScrollbackStats {
                line_count: self.scrollback.line_count(),
            },
            metadata: self.metadata.clone(),
        }
    }

    fn emit_bytes(&mut self, bytes: Vec<u8>) {
        let record = self.next_record(ReplayPayload::Bytes(bytes));
        self.broadcast_record(record);
    }

    fn emit_metadata(&mut self, metadata: SessionMetadataDelta) {
        let record = self.next_record(ReplayPayload::Metadata(metadata));
        self.broadcast_record(record);
    }

    fn emit_rehydrate(&mut self, reason: RehydrateReason) {
        let record = self.next_record(
            self.make_rehydrate_payload(reason, self.max_rehydrate_scrollback_lines()),
        );
        self.broadcast_record(record);
    }

    fn emit_rehydrate_to_viewer(
        &mut self,
        viewer_id: ViewerId,
        reason: RehydrateReason,
        rehydrate_scrollback_lines: usize,
    ) -> Result<()> {
        let record =
            self.next_record(self.make_rehydrate_payload(reason, rehydrate_scrollback_lines));
        self.replay_log.push(record.clone());
        self.send_record_to_viewer(viewer_id, &record)
    }

    fn make_rehydrate_payload(
        &self,
        reason: RehydrateReason,
        rehydrate_scrollback_lines: usize,
    ) -> ReplayPayload {
        let snapshot = self.terminal.snapshot();
        let active_buffer = if snapshot.alternate_screen {
            BufferKind::Alternate
        } else {
            BufferKind::Primary
        };
        ReplayPayload::Rehydrate {
            reason,
            active_buffer,
            size: self.metadata.size,
            vt_payload: self.compose_rehydrate_payload(active_buffer, rehydrate_scrollback_lines),
            metadata: self.stream_metadata(),
        }
    }

    fn compose_rehydrate_payload(
        &self,
        active_buffer: BufferKind,
        rehydrate_scrollback_lines: usize,
    ) -> Vec<u8> {
        let mut payload = Vec::new();
        if active_buffer == BufferKind::Primary {
            for line in self
                .scrollback
                .recent_completed_lines(rehydrate_scrollback_lines)
            {
                payload.extend_from_slice(line.text.as_bytes());
                payload.extend_from_slice(b"\r\n");
            }
        }
        payload.extend_from_slice(&self.terminal.rehydrate());
        payload
    }

    fn max_rehydrate_scrollback_lines(&self) -> usize {
        self.viewers
            .values()
            .map(|viewer| viewer.rehydrate_scrollback_lines)
            .max()
            .unwrap_or(DEFAULT_REHYDRATE_SCROLLBACK_LINES)
    }

    fn stream_metadata(&self) -> SessionStreamMetadata {
        SessionStreamMetadata {
            title: self.metadata.title.clone(),
            status: self.metadata.status,
            cwd: self.metadata.cwd.clone(),
            shell: self.metadata.shell.clone(),
            process_id: self.metadata.process_id,
            exit_code: self.metadata.exit_code,
        }
    }

    fn next_record(&mut self, payload: ReplayPayload) -> ReplayRecord {
        self.event_seq = self.event_seq.saturating_add(1);
        ReplayRecord {
            seq: self.event_seq,
            size_bytes: payload.approx_size_bytes(),
            payload,
        }
    }

    fn broadcast_record(&mut self, record: ReplayRecord) {
        self.replay_log.push(record.clone());
        let viewer_ids = self.viewers.keys().copied().collect::<Vec<_>>();
        let mut stale = Vec::new();
        for viewer_id in viewer_ids {
            if self.send_record_to_viewer(viewer_id, &record).is_err() {
                stale.push(viewer_id);
            }
        }
        for viewer_id in stale {
            self.viewers.remove(&viewer_id);
        }
    }

    fn send_record_to_viewer(&self, viewer_id: ViewerId, record: &ReplayRecord) -> Result<()> {
        let viewer = self
            .viewers
            .get(&viewer_id)
            .ok_or_else(|| anyhow!("unknown viewer {}", viewer_id))?;
        let frame = record
            .payload
            .to_frame(record.seq, self.session_id, viewer_id);
        viewer
            .sender
            .send(frame)
            .map_err(|_| anyhow!("viewer stream closed"))?;
        Ok(())
    }

    fn notify_detached(&mut self, reason: ViewerDetachedReason) {
        if self.viewers.is_empty() {
            return;
        }
        self.event_seq = self.event_seq.saturating_add(1);
        let seq = self.event_seq;
        let viewers = std::mem::take(&mut self.viewers);
        for (viewer_id, viewer) in viewers {
            let _ = viewer.sender.send(SessionStreamFrame::ViewerDetached {
                seq,
                session_id: self.session_id,
                viewer_id,
                reason,
            });
        }
    }
}

impl ReplayPayload {
    fn to_frame(&self, seq: u64, session_id: SessionId, viewer_id: ViewerId) -> SessionStreamFrame {
        match self {
            Self::Rehydrate {
                reason,
                active_buffer,
                size,
                vt_payload,
                metadata,
            } => SessionStreamFrame::terminal_rehydrate(
                seq,
                session_id,
                viewer_id,
                *reason,
                *active_buffer,
                *size,
                vt_payload,
                metadata.clone(),
            ),
            Self::Bytes(bytes) => {
                SessionStreamFrame::terminal_bytes(seq, session_id, viewer_id, bytes)
            }
            Self::Metadata(metadata) => SessionStreamFrame::SessionMetadata {
                seq,
                session_id,
                viewer_id,
                metadata: metadata.clone(),
            },
        }
    }

    fn approx_size_bytes(&self) -> usize {
        match self {
            Self::Rehydrate { vt_payload, .. } => vt_payload.len() + 512,
            Self::Bytes(bytes) => bytes.len() + 96,
            Self::Metadata(_) => 256,
        }
    }
}

impl ReplayLog {
    fn new(capacity_bytes: usize) -> Self {
        Self {
            capacity_bytes,
            size_bytes: 0,
            records: VecDeque::new(),
        }
    }

    fn push(&mut self, record: ReplayRecord) {
        self.size_bytes += record.size_bytes;
        self.records.push_back(record);
        while self.size_bytes > self.capacity_bytes && self.records.len() > 1 {
            if let Some(removed) = self.records.pop_front() {
                self.size_bytes = self.size_bytes.saturating_sub(removed.size_bytes);
            }
        }
    }

    fn replay_after(&self, last_seen_seq: u64, current_seq: u64) -> Option<Vec<ReplayRecord>> {
        if last_seen_seq >= current_seq {
            return Some(Vec::new());
        }
        let first_seq = self.records.front().map(|record| record.seq)?;
        if last_seen_seq.saturating_add(1) < first_seq {
            return None;
        }
        Some(
            self.records
                .iter()
                .filter(|record| record.seq > last_seen_seq)
                .cloned()
                .collect(),
        )
    }
}

fn page_to_response(session_id: SessionId, page: ScrollbackPage) -> ReadScrollbackResponse {
    ReadScrollbackResponse {
        session_id,
        first_available_line_id: page.first_available_line_id,
        last_available_line_id: page.last_available_line_id,
        has_more_above: page.has_more_above,
        lines: page
            .lines
            .into_iter()
            .map(|line| ScrollbackLine {
                line_id: line.line_id,
                text: line.text,
            })
            .collect(),
    }
}

fn snapshot_is_renderable(snapshot: &SessionSnapshot) -> bool {
    let has_visible_text = snapshot
        .visible_lines
        .iter()
        .any(|line| line_has_visible_text(line));
    let contains_raw_escape = snapshot
        .visible_lines
        .iter()
        .any(|line| line.contains('\u{1b}'));
    has_visible_text && !contains_raw_escape
}

fn line_has_visible_text(line: &str) -> bool {
    line.chars()
        .any(|ch| !ch.is_whitespace() && !ch.is_control())
}

fn normalize_terminal_output(bytes: &[u8]) -> Vec<u8> {
    if bytes.contains(&0) {
        bytes.iter().copied().filter(|byte| *byte != 0).collect()
    } else {
        bytes.to_vec()
    }
}

fn cursor_position_reply(cursor: aria_model::CursorPosition) -> Vec<u8> {
    format!(
        "\x1b[{};{}R",
        cursor.row.saturating_add(1),
        cursor.col.saturating_add(1)
    )
    .into_bytes()
}

fn to_summary(metadata: &SessionMetadata) -> SessionSummary {
    SessionSummary {
        session_id: metadata.session_id,
        title: metadata.title.clone(),
        status: metadata.status,
        transport: metadata.transport,
        size: metadata.size,
        created_at: metadata.created_at.clone(),
        updated_at: metadata.updated_at.clone(),
    }
}

fn spawn_output_reader(mut reader: Box<dyn Read + Send>, sender: mpsc::Sender<SessionCommand>) {
    tokio::task::spawn_blocking(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(read) => {
                    if sender
                        .blocking_send(SessionCommand::ProcessOutput(buffer[..read].to_vec()))
                        .is_err()
                    {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    });
}

fn spawn_child_waiter(
    mut child: Box<dyn portable_pty::Child + Send>,
    sender: mpsc::Sender<SessionCommand>,
) {
    tokio::task::spawn_blocking(move || {
        let exit_code = child.wait().ok().map(|status| status.exit_code());
        let _ = sender.blocking_send(SessionCommand::ProcessExit(exit_code));
    });
}

fn unix_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::{
        cursor_position_reply, line_has_visible_text, normalize_terminal_output, run_session_actor,
        snapshot_is_renderable, ReplayLog, SessionActor, SessionCommand, SessionHandle,
        SessionManager,
    };
    use crate::scrollback::ScrollbackBuffer;
    use crate::transport::{Transport, TransportMetadata};
    use anyhow::{anyhow, Result};
    use aria_ipc::{
        AttachViewerRequest, BufferKind, DetachViewerRequest, ReadScrollbackRequest,
        RehydrateReason, ReplayMode, ScrollbackStats, SessionMetadata, SessionSnapshot,
        SessionStreamFrame, SessionStreamMetadata, ViewerRole,
    };
    use aria_model::{
        CursorPosition, SessionId, SessionStatus, SessionTransportKind, TerminalSize,
    };
    use aria_terminal::Vt100TerminalEngine;
    use async_trait::async_trait;
    use std::collections::HashMap;
    use tokio::sync::{mpsc, oneshot};

    struct TestTransport {
        metadata: TransportMetadata,
    }

    struct BlockingShutdownTransport {
        metadata: TransportMetadata,
        shutdown_started: Option<oneshot::Sender<()>>,
        shutdown_release: Option<oneshot::Receiver<()>>,
    }

    struct FailingShutdownTransport {
        metadata: TransportMetadata,
    }

    #[async_trait]
    impl Transport for TestTransport {
        async fn write(&mut self, _data: &[u8]) -> Result<()> {
            Ok(())
        }

        async fn resize(&mut self, _size: TerminalSize) -> Result<()> {
            Ok(())
        }

        async fn shutdown(&mut self) -> Result<()> {
            Ok(())
        }

        fn metadata(&self) -> &TransportMetadata {
            &self.metadata
        }
    }

    #[async_trait]
    impl Transport for BlockingShutdownTransport {
        async fn write(&mut self, _data: &[u8]) -> Result<()> {
            Ok(())
        }

        async fn resize(&mut self, _size: TerminalSize) -> Result<()> {
            Ok(())
        }

        async fn shutdown(&mut self) -> Result<()> {
            if let Some(started) = self.shutdown_started.take() {
                let _ = started.send(());
            }
            if let Some(release) = self.shutdown_release.take() {
                let _ = release.await;
            }
            Ok(())
        }

        fn metadata(&self) -> &TransportMetadata {
            &self.metadata
        }
    }

    #[async_trait]
    impl Transport for FailingShutdownTransport {
        async fn write(&mut self, _data: &[u8]) -> Result<()> {
            Ok(())
        }

        async fn resize(&mut self, _size: TerminalSize) -> Result<()> {
            Ok(())
        }

        async fn shutdown(&mut self) -> Result<()> {
            Err(anyhow!("mock transport shutdown failure"))
        }

        fn metadata(&self) -> &TransportMetadata {
            &self.metadata
        }
    }

    fn test_metadata(session_id: SessionId, size: TerminalSize) -> SessionMetadata {
        SessionMetadata {
            session_id,
            title: "powershell".to_string(),
            status: SessionStatus::Running,
            transport: SessionTransportKind::LocalPty,
            size,
            created_at: "1".to_string(),
            updated_at: "1".to_string(),
            cwd: Some("C:/repo".to_string()),
            command: vec!["powershell.exe".to_string()],
            shell: "powershell.exe".to_string(),
            process_id: Some(42),
            exit_code: None,
        }
    }

    fn spawn_test_actor(
        size: TerminalSize,
        replay_capacity: usize,
    ) -> (SessionId, mpsc::Sender<SessionCommand>) {
        let session_id = SessionId::new();
        let actor = SessionActor {
            session_id,
            transport: Box::new(TestTransport {
                metadata: TransportMetadata {
                    kind: SessionTransportKind::LocalPty,
                    tty_name: None,
                    process_id: Some(42),
                },
            }),
            terminal: Box::new(Vt100TerminalEngine::new(size, 256)),
            metadata: test_metadata(session_id, size),
            scrollback: ScrollbackBuffer::new(256),
            pending_terminal_query: Vec::new(),
            viewers: HashMap::new(),
            event_seq: 0,
            replay_log: ReplayLog::new(replay_capacity),
        };
        let (sender, receiver) = mpsc::channel(64);
        tokio::spawn(run_session_actor(actor, receiver));
        (session_id, sender)
    }

    async fn insert_blocking_shutdown_session(
        manager: &SessionManager,
        size: TerminalSize,
    ) -> (SessionId, oneshot::Receiver<()>, oneshot::Sender<()>) {
        let session_id = SessionId::new();
        let (shutdown_started_tx, shutdown_started_rx) = oneshot::channel();
        let (shutdown_release_tx, shutdown_release_rx) = oneshot::channel();
        let actor = SessionActor {
            session_id,
            transport: Box::new(BlockingShutdownTransport {
                metadata: TransportMetadata {
                    kind: SessionTransportKind::LocalPty,
                    tty_name: None,
                    process_id: Some(42),
                },
                shutdown_started: Some(shutdown_started_tx),
                shutdown_release: Some(shutdown_release_rx),
            }),
            terminal: Box::new(Vt100TerminalEngine::new(size, 256)),
            metadata: test_metadata(session_id, size),
            scrollback: ScrollbackBuffer::new(256),
            pending_terminal_query: Vec::new(),
            viewers: HashMap::new(),
            event_seq: 0,
            replay_log: ReplayLog::new(1024),
        };
        let (sender, receiver) = mpsc::channel(64);
        tokio::spawn(run_session_actor(actor, receiver));
        manager
            .sessions
            .write()
            .await
            .insert(session_id, SessionHandle { sender });
        (session_id, shutdown_started_rx, shutdown_release_tx)
    }

    async fn insert_failing_shutdown_session(
        manager: &SessionManager,
        size: TerminalSize,
    ) -> SessionId {
        let session_id = SessionId::new();
        let actor = SessionActor {
            session_id,
            transport: Box::new(FailingShutdownTransport {
                metadata: TransportMetadata {
                    kind: SessionTransportKind::LocalPty,
                    tty_name: None,
                    process_id: Some(42),
                },
            }),
            terminal: Box::new(Vt100TerminalEngine::new(size, 256)),
            metadata: test_metadata(session_id, size),
            scrollback: ScrollbackBuffer::new(256),
            pending_terminal_query: Vec::new(),
            viewers: HashMap::new(),
            event_seq: 0,
            replay_log: ReplayLog::new(1024),
        };
        let (sender, receiver) = mpsc::channel(64);
        tokio::spawn(run_session_actor(actor, receiver));
        manager
            .sessions
            .write()
            .await
            .insert(session_id, SessionHandle { sender });
        session_id
    }

    async fn attach_test_viewer(
        sender: &mpsc::Sender<SessionCommand>,
        session_id: SessionId,
        replay_from_seq: Option<u64>,
    ) -> (
        aria_ipc::AttachViewerResponse,
        mpsc::UnboundedReceiver<SessionStreamFrame>,
    ) {
        attach_test_viewer_with_scrollback(sender, session_id, replay_from_seq, 200).await
    }

    async fn attach_test_viewer_with_scrollback(
        sender: &mpsc::Sender<SessionCommand>,
        session_id: SessionId,
        replay_from_seq: Option<u64>,
        rehydrate_scrollback_lines: usize,
    ) -> (
        aria_ipc::AttachViewerResponse,
        mpsc::UnboundedReceiver<SessionStreamFrame>,
    ) {
        let (stream_tx, stream_rx) = mpsc::unbounded_channel();
        let (reply_tx, reply_rx) = oneshot::channel();
        sender
            .send(SessionCommand::AttachViewer {
                request: AttachViewerRequest {
                    session_id,
                    role: ViewerRole::Interactive,
                    viewport: TerminalSize::new(80, 24),
                    replay_from_seq,
                    rehydrate_scrollback_lines: Some(rehydrate_scrollback_lines),
                },
                stream: stream_tx,
                reply: reply_tx,
            })
            .await
            .expect("send attach");
        (
            reply_rx.await.expect("attach reply").expect("attach ok"),
            stream_rx,
        )
    }

    #[tokio::test]
    async fn attach_viewer_receives_rehydrate_then_bytes() {
        let (session_id, sender) = spawn_test_actor(TerminalSize::new(80, 24), 1024);
        let (response, mut frames) = attach_test_viewer(&sender, session_id, None).await;
        assert_eq!(response.replay_mode, ReplayMode::Rehydrate);

        match frames.recv().await.expect("rehydrate frame") {
            SessionStreamFrame::TerminalRehydrate {
                reason,
                active_buffer,
                metadata,
                ..
            } => {
                assert_eq!(reason, RehydrateReason::Attach);
                assert_eq!(active_buffer, BufferKind::Primary);
                assert_eq!(
                    metadata,
                    SessionStreamMetadata {
                        title: "powershell".to_string(),
                        status: SessionStatus::Running,
                        cwd: Some("C:/repo".to_string()),
                        shell: "powershell.exe".to_string(),
                        process_id: Some(42),
                        exit_code: None,
                    }
                );
            }
            other => panic!("unexpected rehydrate frame: {other:?}"),
        }

        sender
            .send(SessionCommand::ProcessOutput(b"hello".to_vec()))
            .await
            .expect("send output");

        match frames.recv().await.expect("bytes frame") {
            SessionStreamFrame::TerminalBytes { bytes, .. } => {
                assert_eq!(
                    SessionStreamFrame::decode_base64(&bytes).expect("decode bytes"),
                    b"hello"
                );
            }
            other => panic!("unexpected bytes frame: {other:?}"),
        }
    }

    #[tokio::test]
    async fn reconnect_within_replay_window_replays_bytes() {
        let (session_id, sender) = spawn_test_actor(TerminalSize::new(80, 24), 1024);
        let (first_attach, mut first_frames) = attach_test_viewer(&sender, session_id, None).await;
        let rehydrate_seq = first_frames.recv().await.expect("rehydrate").seq();

        sender
            .send(SessionCommand::ProcessOutput(b"hello".to_vec()))
            .await
            .expect("send output");
        let bytes_seq = first_frames.recv().await.expect("bytes").seq();

        let (detach_tx, detach_rx) = oneshot::channel();
        sender
            .send(SessionCommand::DetachViewer(
                DetachViewerRequest {
                    viewer_id: first_attach.viewer_id,
                    close_session_if_unused: false,
                },
                detach_tx,
            ))
            .await
            .expect("detach");
        detach_rx.await.expect("detach reply").expect("detach ok");

        let (second_attach, mut replay_frames) =
            attach_test_viewer(&sender, session_id, Some(rehydrate_seq)).await;
        assert_eq!(second_attach.replay_mode, ReplayMode::Bytes);
        assert_eq!(second_attach.next_expected_seq, rehydrate_seq + 1);
        assert_eq!(
            replay_frames.recv().await.expect("replayed").seq(),
            bytes_seq
        );
    }

    #[tokio::test]
    async fn replay_gap_falls_back_to_rehydrate_and_resize_emits_rehydrate() {
        let (session_id, sender) = spawn_test_actor(TerminalSize::new(80, 24), 8);
        let (first_attach, mut first_frames) = attach_test_viewer(&sender, session_id, None).await;
        let initial_seq = first_frames.recv().await.expect("rehydrate").seq();

        sender
            .send(SessionCommand::ProcessOutput(b"first".to_vec()))
            .await
            .expect("first output");
        let _ = first_frames.recv().await.expect("first bytes");
        sender
            .send(SessionCommand::ProcessOutput(b"second-output".to_vec()))
            .await
            .expect("second output");
        let _ = first_frames.recv().await.expect("second bytes");

        let (detach_tx, detach_rx) = oneshot::channel();
        sender
            .send(SessionCommand::DetachViewer(
                DetachViewerRequest {
                    viewer_id: first_attach.viewer_id,
                    close_session_if_unused: false,
                },
                detach_tx,
            ))
            .await
            .expect("detach");
        detach_rx.await.expect("detach reply").expect("detach ok");

        let (reattach, mut replay_frames) =
            attach_test_viewer(&sender, session_id, Some(initial_seq)).await;
        assert_eq!(reattach.replay_mode, ReplayMode::Rehydrate);
        match replay_frames.recv().await.expect("rehydrate gap") {
            SessionStreamFrame::TerminalRehydrate { reason, .. } => {
                assert_eq!(reason, RehydrateReason::ReplayGap);
            }
            other => panic!("unexpected replay-gap frame: {other:?}"),
        }

        let (resize_tx, resize_rx) = oneshot::channel();
        sender
            .send(SessionCommand::Resize(
                TerminalSize::new(100, 30),
                resize_tx,
            ))
            .await
            .expect("resize");
        resize_rx.await.expect("resize reply").expect("resize ok");

        match replay_frames.recv().await.expect("resize rehydrate") {
            SessionStreamFrame::TerminalRehydrate { reason, size, .. } => {
                assert_eq!(reason, RehydrateReason::Resize);
                assert_eq!(size.cols, 100);
                assert_eq!(size.rows, 30);
            }
            other => panic!("unexpected resize frame: {other:?}"),
        }
    }

    #[tokio::test]
    async fn read_scrollback_pages_lines() {
        let (session_id, sender) = spawn_test_actor(TerminalSize::new(80, 24), 1024);
        sender
            .send(SessionCommand::ProcessOutput(b"one\ntwo\nthree".to_vec()))
            .await
            .expect("send output");

        let (reply_tx, reply_rx) = oneshot::channel();
        sender
            .send(SessionCommand::ReadScrollback(
                ReadScrollbackRequest {
                    session_id,
                    before_line_id: None,
                    limit: 2,
                },
                reply_tx,
            ))
            .await
            .expect("read scrollback");

        let page = reply_rx.await.expect("reply").expect("read ok");
        assert_eq!(page.lines.len(), 2);
        assert_eq!(page.lines[0].text, "two");
        assert_eq!(page.lines[1].text, "three");
    }

    #[tokio::test]
    async fn process_output_emits_title_metadata_delta() {
        let (session_id, sender) = spawn_test_actor(TerminalSize::new(80, 24), 1024);
        let (_attach, mut frames) = attach_test_viewer(&sender, session_id, None).await;
        let _ = frames.recv().await.expect("rehydrate");

        sender
            .send(SessionCommand::ProcessOutput(
                b"\x1b]2;Workspace shell\x07".to_vec(),
            ))
            .await
            .expect("send output");

        match frames.recv().await.expect("metadata frame") {
            SessionStreamFrame::SessionMetadata { metadata, .. } => {
                assert_eq!(metadata.title.as_deref(), Some("Workspace shell"));
                assert_eq!(metadata.status, None);
            }
            other => panic!("unexpected frame: {other:?}"),
        }
    }

    #[tokio::test]
    async fn attach_viewer_rehydrate_includes_requested_scrollback_tail() {
        let (session_id, sender) = spawn_test_actor(TerminalSize::new(12, 3), 1024);
        sender
            .send(SessionCommand::ProcessOutput(
                b"one\r\ntwo\r\nthree\r\nfour\r\nfive".to_vec(),
            ))
            .await
            .expect("send output");

        let (_, mut frames) =
            attach_test_viewer_with_scrollback(&sender, session_id, None, 4).await;

        match frames.recv().await.expect("rehydrate frame") {
            SessionStreamFrame::TerminalRehydrate { vt_payload, .. } => {
                let decoded = SessionStreamFrame::decode_base64(&vt_payload)
                    .expect("decode rehydrate payload");
                let rendered = String::from_utf8_lossy(&decoded);

                assert!(
                    rendered.contains("one\r\n"),
                    "expected rehydrate payload to include scrollback tail, got: {rendered:?}"
                );
            }
            other => panic!("unexpected rehydrate frame: {other:?}"),
        }
    }

    #[tokio::test]
    async fn resize_rehydrate_preserves_attached_viewer_scrollback_tail() {
        let (session_id, sender) = spawn_test_actor(TerminalSize::new(12, 3), 1024);
        let (_, mut frames) =
            attach_test_viewer_with_scrollback(&sender, session_id, None, 4).await;
        let _ = frames.recv().await.expect("initial rehydrate");

        sender
            .send(SessionCommand::ProcessOutput(
                b"one\r\ntwo\r\nthree\r\nfour\r\nfive".to_vec(),
            ))
            .await
            .expect("send output");
        let _ = frames.recv().await.expect("bytes frame");

        let (resize_tx, resize_rx) = oneshot::channel();
        sender
            .send(SessionCommand::Resize(TerminalSize::new(14, 3), resize_tx))
            .await
            .expect("resize");
        resize_rx.await.expect("resize reply").expect("resize ok");

        match frames.recv().await.expect("resize rehydrate") {
            SessionStreamFrame::TerminalRehydrate {
                reason, vt_payload, ..
            } => {
                assert_eq!(reason, RehydrateReason::Resize);
                let decoded = SessionStreamFrame::decode_base64(&vt_payload)
                    .expect("decode rehydrate payload");
                let rendered = String::from_utf8_lossy(&decoded);

                assert!(
                    rendered.contains("one\r\n"),
                    "expected resize rehydrate to keep scrollback tail, got: {rendered:?}"
                );
            }
            other => panic!("unexpected resize rehydrate frame: {other:?}"),
        }
    }

    #[tokio::test]
    async fn alternate_screen_rehydrate_omits_primary_scrollback_tail() {
        let (session_id, sender) = spawn_test_actor(TerminalSize::new(12, 3), 1024);
        sender
            .send(SessionCommand::ProcessOutput(
                b"one\r\ntwo\r\n\x1b[?1049halt-screen".to_vec(),
            ))
            .await
            .expect("send output");

        let (_, mut frames) =
            attach_test_viewer_with_scrollback(&sender, session_id, None, 4).await;

        match frames.recv().await.expect("rehydrate frame") {
            SessionStreamFrame::TerminalRehydrate {
                active_buffer,
                vt_payload,
                ..
            } => {
                assert_eq!(active_buffer, BufferKind::Alternate);
                let decoded = SessionStreamFrame::decode_base64(&vt_payload)
                    .expect("decode rehydrate payload");
                let rendered = String::from_utf8_lossy(&decoded);

                assert!(rendered.contains("alt-screen"));
                assert!(
                    !rendered.contains("one\r\n"),
                    "expected alternate-screen rehydrate to skip primary scrollback, got: {rendered:?}"
                );
            }
            other => panic!("unexpected rehydrate frame: {other:?}"),
        }
    }

    #[tokio::test]
    async fn close_removes_session_from_registry_before_shutdown_finishes() {
        let manager = SessionManager::new();
        let (session_id, shutdown_started, shutdown_release) =
            insert_blocking_shutdown_session(&manager, TerminalSize::new(80, 24)).await;

        let close_task = tokio::spawn({
            let manager = manager.clone();
            async move {
                manager
                    .close(aria_ipc::SessionSelector { session_id })
                    .await
            }
        });

        shutdown_started
            .await
            .expect("shutdown should start before close finishes");

        assert!(
            !manager.sessions.read().await.contains_key(&session_id),
            "closing session should be removed from the visible registry before transport shutdown finishes"
        );

        shutdown_release.send(()).expect("release shutdown");
        close_task.await.expect("close task").expect("close ok");
    }

    #[tokio::test]
    async fn close_removes_session_even_when_transport_shutdown_reports_failure() {
        let manager = SessionManager::new();
        let session_id = insert_failing_shutdown_session(&manager, TerminalSize::new(80, 24)).await;

        manager
            .close(aria_ipc::SessionSelector { session_id })
            .await
            .expect("close should remove the session even when transport shutdown reports failure");

        assert!(
            !manager.sessions.read().await.contains_key(&session_id),
            "failed transport shutdown must not leave an exited session requiring a second close"
        );
    }

    #[tokio::test]
    async fn close_if_no_viewers_closes_unviewed_session() {
        let manager = SessionManager::new();
        let session_id = insert_failing_shutdown_session(&manager, TerminalSize::new(80, 24)).await;

        manager
            .close_if_no_viewers(session_id)
            .await
            .expect("conditional close should succeed");

        assert!(
            !manager.sessions.read().await.contains_key(&session_id),
            "unviewed sessions should be removed from the registry"
        );
    }

    #[tokio::test]
    async fn close_if_no_viewers_preserves_viewed_session() {
        let manager = SessionManager::new();
        let session_id = insert_failing_shutdown_session(&manager, TerminalSize::new(80, 24)).await;
        let handle = manager.handle(session_id).await.expect("session handle");
        let (_attach, _frames) = attach_test_viewer(&handle.sender, session_id, None).await;

        manager
            .close_if_no_viewers(session_id)
            .await
            .expect("conditional close should succeed");

        assert!(
            manager.sessions.read().await.contains_key(&session_id),
            "sessions with attached viewers must stay registered"
        );
    }

    #[tokio::test]
    async fn close_if_no_viewers_preserves_background_session() {
        let manager = SessionManager::new();
        let session_id = insert_failing_shutdown_session(&manager, TerminalSize::new(80, 24)).await;

        manager
            .set_background(aria_ipc::SetSessionBackgroundRequest {
                session_id,
                background: true,
            })
            .await
            .expect("mark background");

        let closed = manager
            .close_if_no_viewers(session_id)
            .await
            .expect("conditional close should succeed");

        assert!(!closed);
        assert!(
            manager.sessions.read().await.contains_key(&session_id),
            "background sessions must stay registered without attached viewers"
        );
        assert_eq!(
            manager
                .metadata(aria_ipc::SessionSelector { session_id })
                .await
                .expect("metadata")
                .status,
            SessionStatus::Background
        );
    }

    #[tokio::test]
    async fn foreground_background_session_can_be_cleaned_up_when_unviewed() {
        let manager = SessionManager::new();
        let session_id = insert_failing_shutdown_session(&manager, TerminalSize::new(80, 24)).await;

        manager
            .set_background(aria_ipc::SetSessionBackgroundRequest {
                session_id,
                background: true,
            })
            .await
            .expect("mark background");
        manager
            .set_background(aria_ipc::SetSessionBackgroundRequest {
                session_id,
                background: false,
            })
            .await
            .expect("mark foreground");

        let closed = manager
            .close_if_no_viewers(session_id)
            .await
            .expect("conditional close should succeed");

        assert!(closed);
        assert!(
            !manager.sessions.read().await.contains_key(&session_id),
            "foreground unviewed sessions should be removable again"
        );
    }

    #[tokio::test]
    async fn set_background_emits_metadata_delta_to_attached_viewers() {
        let manager = SessionManager::new();
        let session_id = insert_failing_shutdown_session(&manager, TerminalSize::new(80, 24)).await;
        let handle = manager.handle(session_id).await.expect("session handle");
        let (_attach, mut frames) = attach_test_viewer(&handle.sender, session_id, None).await;
        let _ = frames.recv().await.expect("initial rehydrate");

        manager
            .set_background(aria_ipc::SetSessionBackgroundRequest {
                session_id,
                background: true,
            })
            .await
            .expect("mark background");

        match frames.recv().await.expect("metadata frame") {
            SessionStreamFrame::SessionMetadata { metadata, .. } => {
                assert_eq!(metadata.status, Some(SessionStatus::Background));
            }
            other => panic!("unexpected frame: {other:?}"),
        }
    }

    #[tokio::test]
    async fn background_session_process_exit_reports_exited() {
        let manager = SessionManager::new();
        let session_id = insert_failing_shutdown_session(&manager, TerminalSize::new(80, 24)).await;
        manager
            .set_background(aria_ipc::SetSessionBackgroundRequest {
                session_id,
                background: true,
            })
            .await
            .expect("mark background");

        let handle = manager.handle(session_id).await.expect("session handle");
        handle
            .sender
            .send(SessionCommand::ProcessExit(Some(0)))
            .await
            .expect("send process exit");

        assert_eq!(
            manager
                .metadata(aria_ipc::SessionSelector { session_id })
                .await
                .expect("metadata")
                .status,
            SessionStatus::Exited
        );
    }

    #[test]
    fn line_has_visible_text_requires_printable_content() {
        assert!(!line_has_visible_text(""));
        assert!(!line_has_visible_text("   "));
        assert!(line_has_visible_text("C:\\Users\\Ted Zyzsdy>"));
    }

    #[test]
    fn normalize_terminal_output_strips_nul_padding() {
        assert_eq!(normalize_terminal_output(b"a\0b\0c\0"), b"abc");
    }

    #[test]
    fn cursor_position_reply_uses_one_based_coordinates() {
        assert_eq!(
            cursor_position_reply(CursorPosition { row: 0, col: 0 }),
            b"\x1b[1;1R"
        );
        assert_eq!(
            cursor_position_reply(CursorPosition { row: 2, col: 4 }),
            b"\x1b[3;5R"
        );
    }

    #[test]
    fn snapshot_is_renderable_requires_visible_content_without_raw_escape_sequences() {
        let session_id = SessionId::new();
        let metadata = SessionMetadata {
            session_id,
            title: "cmd.exe".to_string(),
            status: SessionStatus::Running,
            transport: SessionTransportKind::LocalPty,
            size: TerminalSize::new(100, 28),
            created_at: "1".to_string(),
            updated_at: "1".to_string(),
            cwd: None,
            command: vec!["cmd.exe".to_string()],
            shell: "cmd.exe".to_string(),
            process_id: None,
            exit_code: None,
        };
        let blank_snapshot = SessionSnapshot {
            session_id,
            size: TerminalSize::new(100, 28),
            visible_lines: vec![String::new(); 28],
            cursor: CursorPosition { row: 0, col: 0 },
            alternate_screen: false,
            scrollback: ScrollbackStats { line_count: 0 },
            metadata: metadata.clone(),
        };
        let raw_escape_snapshot = SessionSnapshot {
            visible_lines: vec!["\u{1b}[?9001h".to_string()],
            ..blank_snapshot.clone()
        };
        let prompt_snapshot = SessionSnapshot {
            visible_lines: vec!["C:\\Users\\Ted Zyzsdy>".to_string()],
            ..blank_snapshot
        };

        assert!(!snapshot_is_renderable(&raw_escape_snapshot));
        assert!(snapshot_is_renderable(&prompt_snapshot));
    }
}
