#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use anyhow::{anyhow, Context, Result};
use aria_core::{init_observability, AppRole, BootstrapContext};
use aria_ipc::{
    CreateLocalSessionRequest, CreateLocalSessionResponse, DaemonClient, HealthRequest,
    HealthResponse, ListSessionsRequest, SessionSelector, SessionSnapshot, SessionSummary,
    DEFAULT_DAEMON_ADDR,
};
use aria_model::{AppInfo, SessionId, TerminalSize};
use std::{
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
    time::Duration,
};
use tauri::State;
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
            get_session_snapshot
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
