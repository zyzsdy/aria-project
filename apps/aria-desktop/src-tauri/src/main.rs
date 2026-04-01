#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use anyhow::Result;
use aria_core::{init_observability, AppRole, BootstrapContext};
use aria_ipc::{DaemonInfo, HealthResponse};
use aria_model::{AppInfo, HealthStatus};
use tauri::State;
use tracing::info;

#[derive(Clone)]
struct DesktopState {
    health: HealthResponse,
}

#[tauri::command]
fn health(state: State<'_, DesktopState>) -> HealthResponse {
    state.health.clone()
}

fn main() -> Result<()> {
    let app_info = AppInfo::new(
        "Aria Desktop",
        env!("CARGO_PKG_VERSION"),
        option_env!("ARIA_BUILD_TIME").map(|value| value.to_owned()),
        std::env::consts::OS,
    );

    let context = BootstrapContext::load(AppRole::Desktop, app_info)?;
    let _observability =
        init_observability(context.role, &context.paths, context.config.log_level.as_str())?;

    info!(
        role = %context.role,
        version = %context.app_info.version,
        config = %context.paths.config_file.display(),
        "aria-desktop shell bootstrap complete"
    );

    let desktop_health = HealthResponse {
        status: HealthStatus::Ready,
        app: context.app_info.clone(),
        daemon: Some(DaemonInfo {
            pid: std::process::id(),
            api_version: "phase0".to_string(),
            started_at: None,
            role: "desktop-shell".to_string(),
            status: HealthStatus::Ready,
        }),
        message: "daemon integration pending".to_string(),
    };

    tauri::Builder::default()
        .manage(DesktopState {
            health: desktop_health,
        })
        .invoke_handler(tauri::generate_handler![health])
        .run(tauri::generate_context!())?;

    Ok(())
}
