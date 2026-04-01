use crate::{AppPaths, AppRole, AriaError, Result};
use std::sync::OnceLock;
use tracing_appender::non_blocking::WorkerGuard;
use tracing_subscriber::{fmt, layer::SubscriberExt, EnvFilter};

static OBSERVABILITY_INIT: OnceLock<()> = OnceLock::new();

#[derive(Default)]
pub struct ObservabilityHandle {
    _guards: Vec<WorkerGuard>,
}

pub fn init_observability(
    role: AppRole,
    paths: &AppPaths,
    log_level: &str,
) -> Result<ObservabilityHandle> {
    if OBSERVABILITY_INIT.get().is_some() {
        return Ok(ObservabilityHandle::default());
    }

    paths.ensure()?;

    let file_appender = tracing_appender::rolling::daily(&paths.log_dir, format!("{}.log", role));
    let (file_writer, file_guard) = tracing_appender::non_blocking(file_appender);
    let env_filter = EnvFilter::try_new(log_level)
        .unwrap_or_else(|_| EnvFilter::new(format!("{log_level},tauri=info,wry=info")));

    let stderr_layer = fmt::layer().with_target(true).with_writer(std::io::stderr);
    let file_layer = fmt::layer()
        .with_ansi(false)
        .with_target(true)
        .with_writer(file_writer);

    let subscriber = tracing_subscriber::registry()
        .with(env_filter)
        .with(stderr_layer)
        .with(file_layer);

    tracing::subscriber::set_global_default(subscriber)
        .map_err(|error| AriaError::Observability(error.to_string()))?;

    let _ = OBSERVABILITY_INIT.set(());

    Ok(ObservabilityHandle {
        _guards: vec![file_guard],
    })
}
