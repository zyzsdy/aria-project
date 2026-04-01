use anyhow::Result;
use aria_core::{init_observability, AppRole, BootstrapContext};
use aria_model::AppInfo;
use clap::{Parser, Subcommand};
use tracing::info;

#[derive(Debug, Parser)]
#[command(author, version, about = "Aria daemon placeholder")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Debug, Subcommand)]
enum Command {
    Serve,
}

#[tokio::main]
async fn main() -> Result<()> {
    let app_info = AppInfo::new(
        "Aria Daemon",
        env!("CARGO_PKG_VERSION"),
        option_env!("ARIA_BUILD_TIME").map(|value| value.to_owned()),
        std::env::consts::OS,
    );

    let context = BootstrapContext::load(AppRole::Daemon, app_info)?;
    let _observability =
        init_observability(context.role, &context.paths, context.config.log_level.as_str())?;

    match Cli::parse().command.unwrap_or(Command::Serve) {
        Command::Serve => serve(context).await?,
    }

    Ok(())
}

async fn serve(context: BootstrapContext) -> Result<()> {
    info!(
        role = %context.role,
        environment = ?context.env,
        version = %context.app_info.version,
        config = %context.paths.config_file.display(),
        "aria-daemon bootstrap complete"
    );
    info!("phase 0 daemon placeholder is running; press Ctrl+C to stop");

    tokio::signal::ctrl_c().await?;

    info!("shutdown signal received");
    Ok(())
}
