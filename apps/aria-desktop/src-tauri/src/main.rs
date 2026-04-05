#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use anyhow::{anyhow, Context, Result};
use aria_core::{init_observability, AppRole, BootstrapContext};
use aria_ipc::{
    AppSettings, AttachViewerRequest, AttachViewerResponse, CreateLocalSessionRequest,
    CreateLocalSessionResponse, DaemonClient, DetachViewerRequest, GetSettingsRequest,
    HealthRequest, HealthResponse, ListSessionsRequest, ResetSettingsGroupRequest,
    RpcRequest, RpcResponse, SessionSelector, SessionResizeRequest, SessionSnapshot,
    SessionStreamFrame, SessionSummary, SessionWriteRequest, SettingsGroup,
    UpdateAppSettingsPayload, UpdateSettingsRequest, ViewerAckRequest, DEFAULT_DAEMON_ADDR,
};
use aria_model::{AppInfo, SessionId, TerminalSize, ViewerId};
use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
    time::Duration,
};
use tauri::{ipc::Channel, State};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::TcpStream,
};
use tracing::info;

#[derive(Clone)]
struct DesktopState {
    daemon: Arc<DaemonController>,
}

#[derive(Clone)]
struct DaemonController {
    client: DaemonClient,
    daemon_bin: Option<PathBuf>,
}

#[tauri::command]
async fn daemon_health(state: State<'_, DesktopState>) -> Result<HealthResponse, String> {
    state
        .daemon
        .ensure_ready()
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn list_sessions(state: State<'_, DesktopState>) -> Result<Vec<SessionSummary>, String> {
    state
        .daemon
        .ensure_ready()
        .await
        .map_err(|error| error.to_string())?;
    state
        .daemon
        .client
        .list_sessions(ListSessionsRequest)
        .await
        .map(|response| response.sessions)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn create_local_session(
    state: State<'_, DesktopState>,
    cols: Option<u16>,
    rows: Option<u16>,
) -> Result<CreateLocalSessionResponse, String> {
    state
        .daemon
        .ensure_ready()
        .await
        .map_err(|error| error.to_string())?;
    state
        .daemon
        .client
        .create_local_session(CreateLocalSessionRequest {
            size: TerminalSize::new(cols.unwrap_or(80), rows.unwrap_or(24)),
            cwd: None,
            command: None,
        })
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_session_snapshot(
    state: State<'_, DesktopState>,
    session_id: String,
) -> Result<SessionSnapshot, String> {
    state
        .daemon
        .ensure_ready()
        .await
        .map_err(|error| error.to_string())?;
    let session_id = session_id
        .parse::<SessionId>()
        .map_err(|error| format!("invalid session id: {error}"))?;
    state
        .daemon
        .client
        .get_session_snapshot(SessionSelector { session_id })
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn write_session(
    state: State<'_, DesktopState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    state
        .daemon
        .ensure_ready()
        .await
        .map_err(|error| error.to_string())?;
    let session_id = session_id
        .parse::<SessionId>()
        .map_err(|error| format!("invalid session id: {error}"))?;
    state
        .daemon
        .client
        .write_session(SessionWriteRequest { session_id, data })
        .await
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn resize_session(
    state: State<'_, DesktopState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state
        .daemon
        .ensure_ready()
        .await
        .map_err(|error| error.to_string())?;
    let session_id = session_id
        .parse::<SessionId>()
        .map_err(|error| format!("invalid session id: {error}"))?;
    state
        .daemon
        .client
        .resize_session(SessionResizeRequest {
            session_id,
            size: TerminalSize::new(cols, rows),
        })
        .await
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn attach_session_stream(
    state: State<'_, DesktopState>,
    session_id: String,
    cols: Option<u16>,
    rows: Option<u16>,
    replay_from_seq: Option<u64>,
    stream: Channel<SessionStreamFrame>,
) -> Result<AttachViewerResponse, String> {
    state
        .daemon
        .attach_session_stream(
            session_id,
            TerminalSize::new(cols.unwrap_or(80), rows.unwrap_or(24)),
            replay_from_seq,
            stream,
        )
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn detach_viewer(
    state: State<'_, DesktopState>,
    viewer_id: String,
) -> Result<(), String> {
    state
        .daemon
        .ensure_ready()
        .await
        .map_err(|error| error.to_string())?;
    let viewer_id = viewer_id
        .parse::<ViewerId>()
        .map_err(|error| format!("invalid viewer id: {error}"))?;
    state
        .daemon
        .client
        .detach_viewer(DetachViewerRequest { viewer_id })
        .await
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn viewer_ack(
    state: State<'_, DesktopState>,
    viewer_id: String,
    seq: u64,
) -> Result<(), String> {
    state
        .daemon
        .ensure_ready()
        .await
        .map_err(|error| error.to_string())?;
    let viewer_id = viewer_id
        .parse::<ViewerId>()
        .map_err(|error| format!("invalid viewer id: {error}"))?;
    state
        .daemon
        .client
        .viewer_ack(ViewerAckRequest { viewer_id, seq })
        .await
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn get_app_settings(state: State<'_, DesktopState>) -> Result<AppSettings, String> {
    state
        .daemon
        .ensure_ready()
        .await
        .map_err(|error| error.to_string())?;
    state
        .daemon
        .client
        .get_settings(GetSettingsRequest)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn update_app_settings(
    state: State<'_, DesktopState>,
    settings: UpdateAppSettingsPayload,
) -> Result<AppSettings, String> {
    state
        .daemon
        .ensure_ready()
        .await
        .map_err(|error| error.to_string())?;
    state
        .daemon
        .client
        .update_settings(UpdateSettingsRequest { settings })
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn reset_app_settings_group(
    state: State<'_, DesktopState>,
    group: SettingsGroup,
) -> Result<AppSettings, String> {
    state
        .daemon
        .ensure_ready()
        .await
        .map_err(|error| error.to_string())?;
    state
        .daemon
        .client
        .reset_settings_group(ResetSettingsGroupRequest { group })
        .await
        .map_err(|error| error.to_string())
}

fn main() -> Result<()> {
    let app_info = AppInfo::new(
        "Aria Desktop",
        env!("CARGO_PKG_VERSION"),
        option_env!("ARIA_BUILD_TIME").map(|value| value.to_owned()),
        std::env::consts::OS,
    );

    let context = BootstrapContext::load(AppRole::Desktop, app_info)?;
    let _observability = init_observability(
        context.role,
        &context.paths,
        context.config.log_level.as_str(),
    )?;

    info!(
        role = %context.role,
        version = %context.app_info.version,
        config = %context.paths.config_file.display(),
        "aria-desktop shell bootstrap complete"
    );

    let daemon_addr =
        std::env::var("ARIA_DAEMON_ADDR").unwrap_or_else(|_| DEFAULT_DAEMON_ADDR.to_string());
    let daemon = Arc::new(DaemonController {
        client: DaemonClient::new(daemon_addr),
        daemon_bin: resolve_daemon_binary(),
    });

    tauri::Builder::default()
        .manage(DesktopState { daemon })
        .invoke_handler(tauri::generate_handler![
            daemon_health,
            list_sessions,
            create_local_session,
            get_session_snapshot,
            write_session,
            resize_session,
            attach_session_stream,
            detach_viewer,
            viewer_ack,
            get_app_settings,
            update_app_settings,
            reset_app_settings_group
        ])
        .run(tauri::generate_context!())?;

    Ok(())
}

impl DaemonController {
    async fn ensure_ready(&self) -> Result<HealthResponse> {
        if let Ok(health) = self
            .client
            .health_ping(HealthRequest { verbose: true })
            .await
        {
            return Ok(health);
        }

        self.spawn_daemon()?;

        for _ in 0..20 {
            if let Ok(health) = self
                .client
                .health_ping(HealthRequest { verbose: true })
                .await
            {
                return Ok(health);
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }

        Err(anyhow!("daemon did not become healthy after launch"))
    }

    fn spawn_daemon(&self) -> Result<()> {
        let daemon_bin = self
            .daemon_bin
            .as_ref()
            .ok_or_else(|| anyhow!("unable to locate aria-daemon binary"))?;

        Command::new(daemon_bin)
            .arg("serve")
            .spawn()
            .with_context(|| format!("spawn {}", daemon_bin.display()))?;

        Ok(())
    }

    async fn attach_session_stream(
        &self,
        session_id: String,
        viewport: TerminalSize,
        replay_from_seq: Option<u64>,
        stream: Channel<SessionStreamFrame>,
    ) -> Result<AttachViewerResponse> {
        self.ensure_ready().await?;
        let session_id = session_id
            .parse::<SessionId>()
            .map_err(|error| anyhow!("invalid session id: {error}"))?;
        let request = RpcRequest {
            method: "sessions.attachViewer".to_string(),
            payload: serde_json::to_value(AttachViewerRequest {
                session_id,
                role: aria_ipc::ViewerRole::Interactive,
                viewport,
                replay_from_seq,
                rehydrate_scrollback_lines: Some(200),
            })?,
        };

        let mut socket = TcpStream::connect(self.client.addr()).await?;
        let encoded = serde_json::to_vec(&request)?;
        socket.write_all(&encoded).await?;
        socket.write_all(b"\n").await?;
        socket.flush().await?;

        let mut reader = BufReader::new(socket);
        let mut line = String::new();
        reader.read_line(&mut line).await?;
        let response: AttachViewerResponse = decode_ok_response(&line)?;
        let viewer_id = response.viewer_id;
        let client = self.client.clone();

        tokio::spawn(async move {
            let mut reader = reader;
            let mut line = String::new();
            loop {
                line.clear();
                match reader.read_line(&mut line).await {
                    Ok(0) => break,
                    Ok(_) => {
                        let frame = match serde_json::from_str::<SessionStreamFrame>(&line) {
                            Ok(frame) => frame,
                            Err(_) => break,
                        };
                        if stream.send(frame).is_err() {
                            break;
                        }
                    }
                    Err(_) => break,
                }
            }

            let _ = client
                .detach_viewer(DetachViewerRequest { viewer_id })
                .await;
        });

        Ok(response)
    }
}

fn resolve_daemon_binary() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("ARIA_DAEMON_BIN") {
        let path = PathBuf::from(path);
        if path.exists() {
            return Some(path);
        }
    }

    let current_exe = std::env::current_exe().ok()?;
    let file_name = if cfg!(target_os = "windows") {
        "aria-daemon.exe"
    } else {
        "aria-daemon"
    };

    let mut candidates = Vec::new();
    if let Some(parent) = current_exe.parent() {
        candidates.push(parent.join(file_name));
        if let Some(grand_parent) = parent.parent() {
            candidates.push(grand_parent.join(file_name));
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("target").join("debug").join(file_name));
        candidates.push(cwd.join("target").join("release").join(file_name));
    }

    candidates.into_iter().find(|path| is_file(path))
}

fn is_file(path: &Path) -> bool {
    path.is_file()
}

fn decode_ok_response<T>(line: &str) -> Result<T>
where
    T: for<'de> serde::Deserialize<'de>,
{
    let response: RpcResponse = serde_json::from_str(line)?;
    if !response.ok {
        return Err(anyhow!(
            "{}",
            response.error.unwrap_or_else(|| "unknown daemon error".to_string())
        ));
    }
    let payload = response
        .payload
        .ok_or_else(|| anyhow!("daemon returned an empty payload"))?;
    Ok(serde_json::from_value(payload)?)
}
