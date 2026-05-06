mod local_profiles;
mod projects;
mod settings;

use crate::local_profiles::resolve_local_session_request;
use crate::projects::ProjectStore;
use crate::settings::SettingsStore;
use anyhow::{Context, Result};
use aria_core::{init_observability, AppRole, BootstrapContext};
use aria_ipc::{
    AttachViewerRequest, CloseProjectWindowRequest, ContractError, CreateLocalSessionRequest,
    CreateProjectWindowFromTabRequest, DaemonClient, DaemonInfo, DetachViewerRequest,
    EmptyResponse, GetProjectWorkspaceRequest, GetSettingsRequest, HealthRequest, HealthResponse,
    ListSessionsRequest, ProjectSelector, ReadScrollbackRequest, ReorderProjectsRequest,
    RenameProjectRequest, RenameSessionRequest, ResetSettingsGroupRequest, RpcRequest,
    RpcResponse, SessionResizeRequest, SessionSelector, SessionWriteRequest,
    SetSessionBackgroundRequest, UpdateProjectLayoutRequest, UpdateProjectWindowGeometryRequest,
    UpdateProjectWindowLayoutRequest, UpdateSettingsRequest, ViewerAckRequest, DEFAULT_DAEMON_ADDR,
};
use aria_model::{AppInfo, HealthStatus, SessionId};
use aria_session::SessionManager;
use clap::{Parser, Subcommand};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::{TcpListener, TcpStream},
};
use tracing::{info, warn};

#[derive(Debug, Parser)]
#[command(author, version, about = "Aria daemon")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Debug, Subcommand)]
enum Command {
    Serve,
}

struct DaemonState {
    app_info: AppInfo,
    manager: SessionManager,
    projects: ProjectStore,
    settings: SettingsStore,
    started_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LockRecord {
    pid: u32,
    addr: String,
    started_at: String,
}

enum LockAcquire {
    Acquired(LockGuard),
    AlreadyRunning,
}

struct LockGuard {
    path: PathBuf,
}

#[tokio::main]
async fn main() -> Result<()> {
    let app_info = AppInfo::new(
        "Aria Daemon",
        env!("CARGO_PKG_VERSION"),
        option_env!("ARIA_BUILD_TIME").map(|value| value.to_owned()),
        std::env::consts::OS,
    );

    let context = BootstrapContext::load(AppRole::Daemon, app_info.clone())?;
    let _observability = init_observability(
        context.role,
        &context.paths,
        context.config.log_level.as_str(),
    )?;

    match Cli::parse().command.unwrap_or(Command::Serve) {
        Command::Serve => serve(context, app_info).await?,
    }

    Ok(())
}

async fn serve(context: BootstrapContext, app_info: AppInfo) -> Result<()> {
    let addr =
        std::env::var("ARIA_DAEMON_ADDR").unwrap_or_else(|_| DEFAULT_DAEMON_ADDR.to_string());
    let lock_path = context.paths.data_dir.join("daemon.lock.json");

    if DaemonClient::new(addr.clone())
        .health_ping(HealthRequest { verbose: false })
        .await
        .is_ok()
    {
        info!(addr = %addr, "daemon is already running; exiting duplicate instance");
        return Ok(());
    }

    let _lock = match acquire_lock(&lock_path, &addr).await? {
        LockAcquire::Acquired(lock) => lock,
        LockAcquire::AlreadyRunning => return Ok(()),
    };
    let listener = match TcpListener::bind(&addr).await {
        Ok(listener) => listener,
        Err(error) => {
            if DaemonClient::new(addr.clone())
                .health_ping(HealthRequest { verbose: false })
                .await
                .is_ok()
            {
                info!(addr = %addr, "daemon is already running on the configured address");
                return Ok(());
            }
            return Err(error).with_context(|| format!("bind daemon listener at {addr}"));
        }
    };

    let started_at = unix_timestamp();
    let state = Arc::new(DaemonState {
        app_info,
        manager: SessionManager::new(),
        projects: ProjectStore::load(context.paths.config_dir.join("projects.toml"))?,
        settings: SettingsStore::load(context.paths.config_dir.join("settings.toml"))?,
        started_at: started_at.clone(),
    });

    info!(
        role = %context.role,
        environment = ?context.env,
        version = %state.app_info.version,
        config = %context.paths.config_file.display(),
        addr = %addr,
        "aria-daemon phase 1 runtime ready"
    );

    loop {
        tokio::select! {
            accept_result = listener.accept() => {
                let (stream, remote_addr) = accept_result.context("accept daemon IPC connection")?;
                let state = state.clone();
                tokio::spawn(async move {
                    if let Err(error) = handle_client(stream, state).await {
                        warn!(remote = ?remote_addr, error = %error, "daemon IPC request failed");
                    }
                });
            }
            signal = tokio::signal::ctrl_c() => {
                signal?;
                info!("shutdown signal received");
                break;
            }
        }
    }

    Ok(())
}

async fn handle_client(stream: TcpStream, state: Arc<DaemonState>) -> Result<()> {
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .await
        .context("read RPC request")?;

    if line.trim().is_empty() {
        return Ok(());
    }

    let request: RpcRequest = serde_json::from_str(&line).context("deserialize RPC request")?;
    let mut stream = reader.into_inner();

    if request.method == "sessions.attachViewer" {
        return handle_attach_viewer_stream(stream, request.payload, state).await;
    }

    let response = dispatch_request(request, state).await;
    write_json_line(&mut stream, &response, "RPC response").await
}

async fn dispatch_request(request: RpcRequest, state: Arc<DaemonState>) -> RpcResponse {
    match request.method.as_str() {
        "health.ping" => {
            let _ = decode::<HealthRequest>(request.payload);
            ok(HealthResponse {
                status: HealthStatus::Ready,
                app: state.app_info.clone(),
                daemon: Some(DaemonInfo {
                    pid: std::process::id(),
                    api_version: "phase2".to_string(),
                    started_at: Some(state.started_at.clone()),
                    role: "daemon".to_string(),
                    status: HealthStatus::Ready,
                }),
                message: "daemon ready".to_string(),
            })
        }
        "sessions.list" => match state.manager.list(ListSessionsRequest).await {
            Ok(response) => ok(response),
            Err(error) => err(error),
        },
        "sessions.createLocal" => match decode::<CreateLocalSessionRequest>(request.payload) {
            Ok(payload) => {
                let settings = state.settings.get().await;
                let resolved = resolve_local_session_request(payload, &settings);
                match state
                    .manager
                    .create_local(resolved.request, resolved.title_override)
                    .await
                {
                    Ok(response) => ok(response),
                    Err(error) => err(error),
                }
            }
            Err(error) => err(error),
        },
        "sessions.getSnapshot" => match decode::<SessionSelector>(request.payload) {
            Ok(payload) => match state.manager.snapshot(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(error),
            },
            Err(error) => err(error),
        },
        "sessions.getMetadata" => match decode::<SessionSelector>(request.payload) {
            Ok(payload) => match state.manager.metadata(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(error),
            },
            Err(error) => err(error),
        },
        "sessions.write" => match decode::<SessionWriteRequest>(request.payload) {
            Ok(payload) => match state.manager.write(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(error),
            },
            Err(error) => err(error),
        },
        "sessions.resize" => match decode::<SessionResizeRequest>(request.payload) {
            Ok(payload) => match state.manager.resize(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(error),
            },
            Err(error) => err(error),
        },
        "sessions.close" => match decode::<SessionSelector>(request.payload) {
            Ok(payload) => match state.manager.close(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(error),
            },
            Err(error) => err(error),
        },
        "sessions.rename" => match decode::<RenameSessionRequest>(request.payload) {
            Ok(payload) => match state.manager.rename(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(error),
            },
            Err(error) => err(error),
        },
        "sessions.setBackground" => match decode::<SetSessionBackgroundRequest>(request.payload) {
            Ok(payload) => match state.manager.set_background(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(error),
            },
            Err(error) => err(error),
        },
        "sessions.detachViewer" => match decode::<DetachViewerRequest>(request.payload) {
            Ok(payload) => {
                let close_session_if_unused = payload.close_session_if_unused;
                match state.manager.detach_viewer_with_session(payload).await {
                    Ok(session_id) => {
                        if close_session_if_unused {
                            if let Err(error) =
                                try_close_session_if_unused(state.as_ref(), session_id).await
                            {
                                warn!(
                                    %session_id,
                                    error = %error,
                                    "failed to close detached session after unused check"
                                );
                            }
                        }
                        ok(EmptyResponse {})
                    }
                    Err(error) => err(error),
                }
            }
            Err(error) => err(error),
        },
        "sessions.viewerAck" => match decode::<ViewerAckRequest>(request.payload) {
            Ok(payload) => match state.manager.viewer_ack(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(error),
            },
            Err(error) => err(error),
        },
        "sessions.readScrollback" => match decode::<ReadScrollbackRequest>(request.payload) {
            Ok(payload) => match state.manager.read_scrollback(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(error),
            },
            Err(error) => err(error),
        },
        "settings.get" => match decode::<GetSettingsRequest>(request.payload) {
            Ok(_payload) => ok(state.settings.get().await),
            Err(error) => err(error),
        },
        "settings.update" => match decode::<UpdateSettingsRequest>(request.payload) {
            Ok(payload) => match state.settings.update(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(error),
            },
            Err(error) => err(error),
        },
        "settings.resetGroup" => match decode::<ResetSettingsGroupRequest>(request.payload) {
            Ok(payload) => match state.settings.reset_group(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(error),
            },
            Err(error) => err(error),
        },
        "projects.getWorkspace" => match decode::<GetProjectWorkspaceRequest>(request.payload) {
            Ok(_payload) => ok(state.projects.get().await),
            Err(error) => err(error),
        },
        "projects.create" => match decode::<aria_ipc::CreateProjectRequest>(request.payload) {
            Ok(payload) => match state.projects.create_from_request(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(ContractError::Unavailable(error.to_string())),
            },
            Err(error) => err(error),
        },
        "projects.rename" => match decode::<RenameProjectRequest>(request.payload) {
            Ok(payload) => match state.projects.rename(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(ContractError::Unavailable(error.to_string())),
            },
            Err(error) => err(error),
        },
        "projects.delete" => match decode::<ProjectSelector>(request.payload) {
            Ok(payload) => match state.projects.delete_from_request(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(ContractError::Unavailable(error.to_string())),
            },
            Err(error) => err(error),
        },
        "projects.activate" => match decode::<ProjectSelector>(request.payload) {
            Ok(payload) => match state.projects.activate(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(ContractError::Unavailable(error.to_string())),
            },
            Err(error) => err(error),
        },
        "projects.updateLayout" => match decode::<UpdateProjectLayoutRequest>(request.payload) {
            Ok(payload) => {
                let close_session_if_unused = payload.close_session_if_unused;
                match state.projects.update_layout(payload).await {
                    Ok(response) => {
                        if let Some(session_id) = close_session_if_unused {
                            if let Err(error) =
                                try_close_session_if_unused(state.as_ref(), session_id).await
                            {
                                warn!(
                                    %session_id,
                                    error = %error,
                                    "failed to close unreferenced session after layout update"
                                );
                            }
                        }
                        ok(response)
                    }
                    Err(error) => err(ContractError::Unavailable(error.to_string())),
                }
            }
            Err(error) => err(error),
        },
        "projects.createWindowFromTab" => {
            match decode::<CreateProjectWindowFromTabRequest>(request.payload) {
                Ok(payload) => match state.projects.create_window_from_tab(payload).await {
                    Ok(response) => ok(response),
                    Err(error) => err(ContractError::Unavailable(error.to_string())),
                },
                Err(error) => err(error),
            }
        }
        "projects.updateWindowLayout" => {
            match decode::<UpdateProjectWindowLayoutRequest>(request.payload) {
                Ok(payload) => {
                    let close_session_if_unused = payload.close_session_if_unused;
                    match state.projects.update_window_layout(payload).await {
                        Ok(response) => {
                            if let Some(session_id) = close_session_if_unused {
                                if let Err(error) =
                                    try_close_session_if_unused(state.as_ref(), session_id).await
                                {
                                    warn!(
                                        %session_id,
                                        error = %error,
                                        "failed to close unreferenced session after window layout update"
                                    );
                                }
                            }
                            ok(response)
                        }
                        Err(error) => err(ContractError::Unavailable(error.to_string())),
                    }
                }
                Err(error) => err(error),
            }
        }
        "projects.updateWindowGeometry" => {
            match decode::<UpdateProjectWindowGeometryRequest>(request.payload) {
                Ok(payload) => match state.projects.update_window_geometry(payload).await {
                    Ok(response) => ok(response),
                    Err(error) => err(ContractError::Unavailable(error.to_string())),
                },
                Err(error) => err(error),
            }
        }
        "projects.closeWindow" => match decode::<CloseProjectWindowRequest>(request.payload) {
            Ok(payload) => {
                let session_ids = state
                    .projects
                    .project_window_session_references(payload.project_id, payload.window_id)
                    .await
                    .unwrap_or_default();
                match state.projects.close_window(payload).await {
                    Ok(response) => {
                        for session_id in session_ids {
                            if let Err(error) =
                                try_close_session_if_unused(state.as_ref(), session_id).await
                            {
                                warn!(
                                    %session_id,
                                    error = %error,
                                    "failed to close unreferenced session after project window close"
                                );
                            }
                        }
                        ok(response)
                    }
                    Err(error) => err(ContractError::Unavailable(error.to_string())),
                }
            }
            Err(error) => err(error),
        },
        "projects.reorder" => match decode::<ReorderProjectsRequest>(request.payload) {
            Ok(payload) => match state.projects.reorder(payload).await {
                Ok(response) => ok(response),
                Err(error) => err(ContractError::Unavailable(error.to_string())),
            },
            Err(error) => err(error),
        },
        method => err(ContractError::Unavailable(format!(
            "unknown method {method}"
        ))),
    }
}

async fn try_close_session_if_unused(state: &DaemonState, session_id: SessionId) -> Result<()> {
    if state.projects.has_session_reference(session_id).await {
        return Ok(());
    }
    state.manager.close_if_no_viewers(session_id).await?;
    Ok(())
}

async fn handle_attach_viewer_stream(
    mut stream: TcpStream,
    payload: serde_json::Value,
    state: Arc<DaemonState>,
) -> Result<()> {
    let request: AttachViewerRequest = decode(payload)?;
    let (response, mut frames) = state
        .manager
        .attach_viewer(request)
        .await
        .context("attach viewer")?;

    let viewer_id = response.viewer_id;
    if let Err(error) = write_json_line(&mut stream, &ok(response), "attach response").await {
        let _ = state
            .manager
            .detach_viewer(DetachViewerRequest {
                viewer_id,
                close_session_if_unused: false,
            })
            .await;
        return Err(error);
    }

    while let Some(frame) = frames.recv().await {
        if let Err(error) = write_json_line(&mut stream, &frame, "stream frame").await {
            let _ = state
                .manager
                .detach_viewer(DetachViewerRequest {
                    viewer_id,
                    close_session_if_unused: false,
                })
                .await;
            return Err(error);
        }
    }

    let _ = state
        .manager
        .detach_viewer(DetachViewerRequest {
            viewer_id,
            close_session_if_unused: false,
        })
        .await;
    Ok(())
}

fn ok<T>(payload: T) -> RpcResponse
where
    T: Serialize,
{
    RpcResponse {
        ok: true,
        payload: Some(serde_json::to_value(payload).expect("serialize RPC payload")),
        error: None,
    }
}

fn err(error: impl std::fmt::Display) -> RpcResponse {
    RpcResponse {
        ok: false,
        payload: Some(serde_json::to_value(EmptyResponse {}).expect("serialize empty payload")),
        error: Some(error.to_string()),
    }
}

fn decode<T>(payload: serde_json::Value) -> Result<T>
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_value(payload).context("decode RPC payload")
}

async fn write_json_line<T>(stream: &mut TcpStream, value: &T, label: &str) -> Result<()>
where
    T: Serialize,
{
    let encoded = serde_json::to_vec(value).with_context(|| format!("serialize {label}"))?;
    stream
        .write_all(&encoded)
        .await
        .with_context(|| format!("write {label}"))?;
    stream
        .write_all(b"\n")
        .await
        .with_context(|| format!("write {label} newline"))?;
    stream
        .flush()
        .await
        .with_context(|| format!("flush {label}"))?;
    Ok(())
}

async fn acquire_lock(path: &Path, addr: &str) -> Result<LockAcquire> {
    let record = LockRecord {
        pid: std::process::id(),
        addr: addr.to_string(),
        started_at: unix_timestamp(),
    };
    let encoded = serde_json::to_vec_pretty(&record).context("serialize lock record")?;

    loop {
        match OpenOptions::new().write(true).create_new(true).open(path) {
            Ok(mut file) => {
                use std::io::Write as _;
                file.write_all(&encoded).context("write daemon lock file")?;
                return Ok(LockAcquire::Acquired(LockGuard {
                    path: path.to_path_buf(),
                }));
            }
            Err(error) if error.kind() == ErrorKind::AlreadyExists => {
                if DaemonClient::new(addr.to_string())
                    .health_ping(HealthRequest { verbose: false })
                    .await
                    .is_ok()
                {
                    info!(addr = %addr, "daemon lock exists and peer is healthy");
                    return Ok(LockAcquire::AlreadyRunning);
                }

                fs::remove_file(path).or_else(|remove_error| {
                    if remove_error.kind() == ErrorKind::NotFound {
                        Ok(())
                    } else {
                        Err(remove_error)
                    }
                })?;
            }
            Err(error) => return Err(error).with_context(|| format!("create {:?}", path)),
        }
    }
}

impl Drop for LockGuard {
    fn drop(&mut self) {
        if let Err(error) = fs::remove_file(&self.path) {
            if error.kind() != ErrorKind::NotFound {
                warn!(path = %self.path.display(), error = %error, "failed to remove daemon lock");
            }
        }
    }
}

fn unix_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}
