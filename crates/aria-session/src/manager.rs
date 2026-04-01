use crate::{local_pty::LocalPtyTransport, scrollback::ScrollbackBuffer, transport::Transport};
use anyhow::{anyhow, Context, Result};
use aria_ipc::{
    CreateLocalSessionRequest, CreateLocalSessionResponse, EmptyResponse, ListSessionsRequest,
    ListSessionsResponse, ScrollbackStats, SessionMetadata, SessionResizeRequest, SessionSelector,
    SessionSnapshot, SessionSummary, SessionWriteRequest,
};
use aria_model::{SessionId, SessionStatus, TerminalSize};
use aria_terminal::{TerminalEngine, Vt100TerminalEngine};
use std::{
    collections::HashMap,
    io::Read,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::{mpsc, oneshot, RwLock};
use tokio::time::{sleep, Duration};
use tracing::warn;

const DEFAULT_SCROLLBACK_LINES: usize = 50_000;
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
    Shutdown(oneshot::Sender<Result<()>>),
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
}

impl SessionManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn create_local(
        &self,
        request: CreateLocalSessionRequest,
    ) -> Result<CreateLocalSessionResponse> {
        let session_id = SessionId::new();
        let created_at = unix_timestamp();
        let spawn = LocalPtyTransport::spawn(&request)?;
        let title = spawn
            .command
            .first()
            .cloned()
            .unwrap_or_else(|| "shell".to_string());

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

    pub async fn close(&self, selector: SessionSelector) -> Result<EmptyResponse> {
        let handle = self.handle(selector.session_id).await?;

        let (reply_tx, reply_rx) = oneshot::channel();
        if handle
            .sender
            .send(SessionCommand::Shutdown(reply_tx))
            .await
            .is_err()
        {
            self.sessions.write().await.remove(&selector.session_id);
            return Err(anyhow!("session actor is unavailable"));
        }
        let result = match reply_rx.await {
            Ok(result) => result,
            Err(_) => {
                self.sessions.write().await.remove(&selector.session_id);
                return Err(anyhow!("session actor dropped"));
            }
        };

        match result {
            Ok(()) => {
                self.sessions.write().await.remove(&selector.session_id);
            }
            Err(error) => return Err(error),
        }

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
                let result = actor.transport.resize(size).await.map(|_| {
                    actor.terminal.resize(size);
                    actor.metadata.size = size;
                    actor.metadata.updated_at = unix_timestamp();
                });
                let _ = reply.send(result);
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
            SessionCommand::Shutdown(reply) => {
                let result = if matches!(
                    actor.metadata.status,
                    SessionStatus::Exited | SessionStatus::Closed | SessionStatus::Failed
                ) {
                    actor.metadata.status = SessionStatus::Closed;
                    actor.metadata.updated_at = unix_timestamp();
                    Ok(())
                } else {
                    actor.transport.shutdown().await.map(|_| {
                        actor.metadata.status = SessionStatus::Closed;
                        actor.metadata.updated_at = unix_timestamp();
                    })
                };
                let should_exit = result.is_ok();
                let _ = reply.send(result);
                if should_exit {
                    break;
                }
            }
            SessionCommand::ProcessOutput(bytes) => {
                let normalized = normalize_terminal_output(&bytes);
                let replies = actor.process_terminal_output(&normalized);
                for reply in replies {
                    if let Err(error) = actor.transport.write(&reply).await {
                        warn!(%actor.session_id, error = %error, "failed to send terminal reply");
                    }
                }
                actor.metadata.updated_at = unix_timestamp();
            }
            SessionCommand::ProcessExit(code) => {
                actor.metadata.status = SessionStatus::Exited;
                actor.metadata.exit_code = code;
                actor.metadata.updated_at = unix_timestamp();
            }
        }
    }
}

impl SessionActor {
    fn process_terminal_output(&mut self, bytes: &[u8]) -> Vec<Vec<u8>> {
        const CPR_QUERY: &[u8] = b"\x1b[6n";

        let mut combined = Vec::with_capacity(self.pending_terminal_query.len() + bytes.len());
        combined.extend_from_slice(&self.pending_terminal_query);
        combined.extend_from_slice(bytes);
        self.pending_terminal_query.clear();

        let mut replies = Vec::new();
        let mut chunk_start = 0;
        let mut index = 0;

        while index < combined.len() {
            if combined[index..].starts_with(CPR_QUERY) {
                self.process_terminal_chunk(&combined[chunk_start..index]);
                replies.push(cursor_position_reply(self.terminal.snapshot().cursor));
                index += CPR_QUERY.len();
                chunk_start = index;
                continue;
            }

            if combined[index] == 0x1b {
                let remaining = &combined[index..];
                if CPR_QUERY.starts_with(remaining) && remaining.len() < CPR_QUERY.len() {
                    self.process_terminal_chunk(&combined[chunk_start..index]);
                    self.pending_terminal_query.extend_from_slice(remaining);
                    return replies;
                }
            }

            index += 1;
        }

        self.process_terminal_chunk(&combined[chunk_start..]);
        replies
    }

    fn process_terminal_chunk(&mut self, bytes: &[u8]) {
        if bytes.is_empty() {
            return;
        }

        self.terminal.process(bytes);
        self.scrollback.ingest(bytes);
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
    use super::{line_has_visible_text, normalize_terminal_output, snapshot_is_renderable};
    use aria_ipc::{
        CreateLocalSessionRequest, ScrollbackStats, SessionMetadata, SessionSelector,
        SessionSnapshot, SessionWriteRequest,
    };
    use aria_model::{
        CursorPosition, SessionId, SessionStatus, SessionTransportKind, TerminalSize,
    };

    #[cfg(windows)]
    #[tokio::test]
    async fn create_local_waits_for_default_shell_startup_output() {
        let manager = super::SessionManager::new();
        let created = manager
            .create_local(CreateLocalSessionRequest {
                size: TerminalSize::new(100, 28),
                cwd: None,
                command: None,
            })
            .await
            .expect("create local default shell session");

        let snapshot = manager
            .snapshot(SessionSelector {
                session_id: created.session_id,
            })
            .await
            .expect("capture default shell snapshot");

        let _ = manager
            .write(SessionWriteRequest {
                session_id: created.session_id,
                data: "exit\r".to_string(),
            })
            .await;

        assert!(
            snapshot_is_renderable(&snapshot),
            "expected renderable default shell output, got {:#?}",
            snapshot.visible_lines
        );
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn close_removes_exited_session() {
        let manager = super::SessionManager::new();
        let created = manager
            .create_local(CreateLocalSessionRequest {
                size: TerminalSize::new(80, 24),
                cwd: None,
                command: Some(vec![
                    "cmd.exe".to_string(),
                    "/C".to_string(),
                    "echo".to_string(),
                    "done".to_string(),
                ]),
            })
            .await
            .expect("create short-lived local session");

        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(3);
        loop {
            let metadata = manager
                .metadata(SessionSelector {
                    session_id: created.session_id,
                })
                .await
                .expect("load exited session metadata");

            if metadata.status == SessionStatus::Exited {
                break;
            }

            assert!(
                tokio::time::Instant::now() < deadline,
                "session did not exit before timeout: {:?}",
                metadata.status
            );
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }

        manager
            .close(SessionSelector {
                session_id: created.session_id,
            })
            .await
            .expect("close exited session");

        let error = manager
            .snapshot(SessionSelector {
                session_id: created.session_id,
            })
            .await
            .expect_err("session should be removed after close");

        assert!(error.to_string().contains("unknown session"));
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
            super::cursor_position_reply(CursorPosition { row: 0, col: 0 }),
            b"\x1b[1;1R"
        );
        assert_eq!(
            super::cursor_position_reply(CursorPosition { row: 2, col: 4 }),
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
            ..blank_snapshot.clone()
        };

        assert!(!snapshot_is_renderable(&blank_snapshot));
        assert!(!snapshot_is_renderable(&raw_escape_snapshot));
        assert!(snapshot_is_renderable(&prompt_snapshot));
    }
}
