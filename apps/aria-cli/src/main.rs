use anyhow::Result;
use aria_core::{init_observability, AppRole, BootstrapContext};
use aria_model::AppInfo;
use clap::{Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(author, version, about = "Aria CLI placeholder")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Version,
    Doctor,
}

fn main() -> Result<()> {
    let app_info = AppInfo::new(
        "Aria CLI",
        env!("CARGO_PKG_VERSION"),
        option_env!("ARIA_BUILD_TIME").map(|value| value.to_owned()),
        std::env::consts::OS,
    );

    let context = BootstrapContext::load(AppRole::Cli, app_info)?;
    let _observability =
        init_observability(context.role, &context.paths, context.config.log_level.as_str())?;

    match Cli::parse().command {
        Command::Version => print_version(&context),
        Command::Doctor => print_doctor(&context),
    }

    Ok(())
}

fn print_version(context: &BootstrapContext) {
    println!(
        "{} {} ({})",
        context.app_info.name, context.app_info.version, context.app_info.platform
    );
}

fn print_doctor(context: &BootstrapContext) {
    println!("Aria CLI doctor");
    println!("  version: {}", context.app_info.version);
    println!("  platform: {}", context.app_info.platform);
    println!("  role: {}", context.role);
    println!("  environment: {:?}", context.env);
    println!("  config_file: {}", context.paths.config_file.display());
    println!(
        "  config_exists: {}",
        if context.paths.config_file.exists() {
            "yes"
        } else {
            "no"
        }
    );
    println!("  config_dir: {}", context.paths.config_dir.display());
    println!("  data_dir: {}", context.paths.data_dir.display());
    println!("  cache_dir: {}", context.paths.cache_dir.display());
    println!("  log_dir: {}", context.paths.log_dir.display());
    println!("  log_level: {}", context.config.log_level);
}
