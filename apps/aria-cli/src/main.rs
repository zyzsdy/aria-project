use anyhow::{anyhow, bail, Context, Result};
use aria_core::{init_observability, AppRole, BootstrapContext};
use aria_ipc::{
    CreateLocalSessionRequest, DaemonClient, HealthRequest, ListSessionsRequest,
    SessionResizeRequest, SessionSelector, SessionSummary, SessionWriteRequest,
    DEFAULT_DAEMON_ADDR,
};
use aria_model::{AppInfo, SessionId, TerminalSize};
use clap::{Args, Parser, Subcommand};

#[derive(Debug, Parser)]
#[command(author, version, about = "Aria CLI")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Version,
    Doctor,
    Daemon {
        #[command(subcommand)]
        command: DaemonCommand,
    },
    Sessions {
        #[command(subcommand)]
        command: SessionCommand,
    },
}

#[derive(Debug, Subcommand)]
enum DaemonCommand {
    Status,
}

#[derive(Debug, Subcommand)]
enum SessionCommand {
    List,
    CreateLocal(CreateLocalArgs),
    Snapshot(SessionIdArgs),
    Write(WriteArgs),
    Resize(ResizeArgs),
    #[command(alias = "destroy", alias = "terminate")]
    Close(SessionIdArgs),
}

#[derive(Debug, Args)]
struct CreateLocalArgs {
    #[arg(long, default_value_t = 80)]
    cols: u16,

    #[arg(long, default_value_t = 24)]
    rows: u16,

    #[arg(long)]
    cwd: Option<String>,

    #[arg(long, value_delimiter = ' ')]
    command: Vec<String>,
}

#[derive(Debug, Args)]
struct SessionIdArgs {
    session_id: String,
}

#[derive(Debug, Args)]
struct WriteArgs {
    session_id: String,
    text: String,
}

#[derive(Debug, Args)]
struct ResizeArgs {
    session_id: String,

    #[arg(long)]
    cols: u16,

    #[arg(long)]
    rows: u16,

    #[arg(long, default_value_t = 0)]
    pixel_width: u16,

    #[arg(long, default_value_t = 0)]
    pixel_height: u16,
}

#[tokio::main]
async fn main() -> Result<()> {
    let app_info = AppInfo::new(
        "Aria CLI",
        env!("CARGO_PKG_VERSION"),
        option_env!("ARIA_BUILD_TIME").map(|value| value.to_owned()),
        std::env::consts::OS,
    );

    let context = BootstrapContext::load(AppRole::Cli, app_info)?;
    let _observability = init_observability(
        context.role,
        &context.paths,
        context.config.log_level.as_str(),
    )?;

    let client = DaemonClient::new(
        std::env::var("ARIA_DAEMON_ADDR").unwrap_or_else(|_| DEFAULT_DAEMON_ADDR.to_string()),
    );

    match Cli::parse().command {
        Command::Version => print_version(&context),
        Command::Doctor => print_doctor(&context, &client).await?,
        Command::Daemon { command } => handle_daemon_command(command, &client).await?,
        Command::Sessions { command } => handle_session_command(command, &client).await?,
    }

    Ok(())
}

fn print_version(context: &BootstrapContext) {
    println!(
        "{} {} ({})",
        context.app_info.name, context.app_info.version, context.app_info.platform
    );
}

async fn print_doctor(context: &BootstrapContext, client: &DaemonClient) -> Result<()> {
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
    println!("  daemon_addr: {}", client.addr());

    match client.health_ping(HealthRequest { verbose: true }).await {
        Ok(health) => {
            println!("  daemon_reachable: yes");
            println!("  daemon_status: {:?}", health.status);
            println!("  daemon_message: {}", health.message);
        }
        Err(error) => {
            println!("  daemon_reachable: no");
            println!("  daemon_error: {}", error);
        }
    }

    Ok(())
}

async fn handle_daemon_command(command: DaemonCommand, client: &DaemonClient) -> Result<()> {
    match command {
        DaemonCommand::Status => {
            let health = client
                .health_ping(HealthRequest { verbose: true })
                .await
                .context("query daemon status")?;
            println!("status: {:?}", health.status);
            println!("message: {}", health.message);
            if let Some(daemon) = health.daemon {
                println!("pid: {}", daemon.pid);
                println!("api_version: {}", daemon.api_version);
                println!(
                    "started_at: {}",
                    daemon.started_at.unwrap_or_else(|| "n/a".to_string())
                );
            }
        }
    }

    Ok(())
}

async fn handle_session_command(command: SessionCommand, client: &DaemonClient) -> Result<()> {
    match command {
        SessionCommand::List => {
            let response = client
                .list_sessions(ListSessionsRequest)
                .await
                .context("list daemon sessions")?;
            for session in response.sessions {
                println!(
                    "{}\t{}\t{:?}\t{}x{}",
                    session.session_id,
                    session.title,
                    session.status,
                    session.size.cols,
                    session.size.rows
                );
            }
        }
        SessionCommand::CreateLocal(args) => {
            let response = client
                .create_local_session(CreateLocalSessionRequest {
                    size: TerminalSize::new(args.cols, args.rows),
                    cwd: args.cwd,
                    command: if args.command.is_empty() {
                        None
                    } else {
                        Some(args.command)
                    },
                })
                .await
                .context("create local session")?;
            println!("session_id: {}", response.session_id);
            println!("title: {}", response.summary.title);
        }
        SessionCommand::Snapshot(args) => {
            let session_id = resolve_session_id(client, &args.session_id).await?;
            let snapshot = client
                .get_session_snapshot(SessionSelector { session_id })
                .await
                .context("fetch session snapshot")?;
            println!("session_id: {}", snapshot.session_id);
            println!("status: {:?}", snapshot.metadata.status);
            println!("cursor: {},{}", snapshot.cursor.row, snapshot.cursor.col);
            println!("visible_lines:");
            for line in snapshot.visible_lines {
                println!("  {}", line);
            }
        }
        SessionCommand::Write(args) => {
            let session_id = resolve_session_id(client, &args.session_id).await?;
            client
                .write_session(SessionWriteRequest {
                    session_id,
                    data: args.text,
                })
                .await
                .context("write to session")?;
            println!("ok");
        }
        SessionCommand::Resize(args) => {
            let session_id = resolve_session_id(client, &args.session_id).await?;
            let size = TerminalSize {
                cols: args.cols,
                rows: args.rows,
                pixel_width: args.pixel_width,
                pixel_height: args.pixel_height,
            };
            client
                .resize_session(SessionResizeRequest { session_id, size })
                .await
                .context("resize session")?;
            println!(
                "resized: {} -> {}x{} (pixels {}x{})",
                session_id, size.cols, size.rows, size.pixel_width, size.pixel_height
            );
        }
        SessionCommand::Close(args) => {
            let session_id = resolve_session_id(client, &args.session_id).await?;
            client
                .close_session(SessionSelector { session_id })
                .await
                .context("close session")?;
            println!("closed: {}", session_id);
        }
    }

    Ok(())
}

async fn resolve_session_id(client: &DaemonClient, input: &str) -> Result<SessionId> {
    let response = client
        .list_sessions(ListSessionsRequest)
        .await
        .context("list sessions for id resolution")?;
    match_session_id(input, &response.sessions)
}

fn match_session_id(input: &str, sessions: &[SessionSummary]) -> Result<SessionId> {
    let raw = input.trim();
    if raw.is_empty() {
        bail!("session id cannot be empty");
    }

    let raw_lower = raw.to_ascii_lowercase();
    let raw_compact = normalize_uuid_fragment(&raw_lower);
    if raw_compact.is_empty() {
        bail!("session id '{}' is not a valid UUID prefix", raw);
    }
    let mut prefix_matches = Vec::new();

    for session in sessions {
        let canonical = session.session_id.to_string();
        let canonical_lower = canonical.to_ascii_lowercase();
        let canonical_compact = normalize_uuid_fragment(&canonical_lower);

        if canonical_lower == raw_lower || canonical_compact == raw_compact {
            return Ok(session.session_id);
        }

        if canonical_lower.starts_with(&raw_lower) || canonical_compact.starts_with(&raw_compact) {
            prefix_matches.push(session);
        }
    }

    match prefix_matches.len() {
        1 => Ok(prefix_matches[0].session_id),
        0 if sessions.is_empty() => Err(anyhow!("no sessions are available")),
        0 => Err(anyhow!("unknown session '{}'", raw)),
        _ => Err(anyhow!(
            "session id prefix '{}' is ambiguous: {}",
            raw,
            format_session_matches(&prefix_matches)
        )),
    }
}

fn normalize_uuid_fragment(value: &str) -> String {
    value.chars().filter(|ch| *ch != '-').collect()
}

fn format_session_matches(matches: &[&SessionSummary]) -> String {
    matches
        .iter()
        .take(5)
        .map(|session| format!("{} ({})", session.session_id, session.title))
        .collect::<Vec<_>>()
        .join(", ")
}

#[cfg(test)]
mod tests {
    use super::{match_session_id, normalize_uuid_fragment};
    use aria_ipc::SessionSummary;
    use aria_model::{SessionStatus, SessionTransportKind, TerminalSize};

    fn session_summary(id: &str, title: &str) -> SessionSummary {
        SessionSummary {
            session_id: id.parse().expect("parse session id"),
            title: title.to_string(),
            status: SessionStatus::Running,
            transport: SessionTransportKind::LocalPty,
            size: TerminalSize::new(80, 24),
            created_at: "1".to_string(),
            updated_at: "1".to_string(),
        }
    }

    #[test]
    fn normalize_uuid_fragment_removes_hyphens() {
        assert_eq!(
            normalize_uuid_fragment("550e8400-e29b-41d4-a716-446655440000"),
            "550e8400e29b41d4a716446655440000"
        );
    }

    #[test]
    fn match_session_id_accepts_exact_uuid() {
        let session = session_summary("550e8400-e29b-41d4-a716-446655440000", "shell");
        let resolved = match_session_id("550e8400-e29b-41d4-a716-446655440000", &[session.clone()])
            .expect("resolve exact session id");

        assert_eq!(resolved, session.session_id);
    }

    #[test]
    fn match_session_id_accepts_unique_prefix() {
        let session = session_summary("550e8400-e29b-41d4-a716-446655440000", "shell");
        let resolved =
            match_session_id("550e8400", &[session.clone()]).expect("resolve session id prefix");

        assert_eq!(resolved, session.session_id);
    }

    #[test]
    fn match_session_id_accepts_hyphenless_prefix() {
        let session = session_summary("550e8400-e29b-41d4-a716-446655440000", "shell");
        let resolved = match_session_id("550e8400e29b", &[session.clone()])
            .expect("resolve hyphenless session id prefix");

        assert_eq!(resolved, session.session_id);
    }

    #[test]
    fn match_session_id_rejects_ambiguous_prefix() {
        let sessions = vec![
            session_summary("550e8400-e29b-41d4-a716-446655440000", "shell-a"),
            session_summary("550e8400-e29b-41d4-a716-446655440111", "shell-b"),
        ];

        let error = match_session_id("550e8400", &sessions).expect_err("reject ambiguous prefix");

        assert!(error.to_string().contains("ambiguous"));
    }

    #[test]
    fn match_session_id_rejects_unknown_value() {
        let session = session_summary("550e8400-e29b-41d4-a716-446655440000", "shell");
        let error = match_session_id("1234", &[session]).expect_err("reject unknown session id");

        assert!(error.to_string().contains("unknown session"));
    }
}
