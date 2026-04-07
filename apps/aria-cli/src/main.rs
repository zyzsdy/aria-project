use anyhow::{anyhow, bail, Context, Result};
use aria_core::{init_observability, AppRole, BootstrapContext, ObservabilityHandle};
use aria_ipc::{
    CreateLocalSessionRequest, DaemonClient, HealthRequest, ListSessionsRequest,
    SessionResizeRequest, SessionSelector, SessionSummary, SessionWriteRequest,
    DEFAULT_DAEMON_ADDR,
};
use aria_model::{AppInfo, SessionId, TerminalSize};
use clap::{Args, Parser, Subcommand};
use std::fmt::Write as _;

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
    /// Local utility and showcase commands.
    Tools {
        #[command(subcommand)]
        command: ToolCommand,
    },
}

#[derive(Debug, Subcommand)]
enum ToolCommand {
    /// Show a terminal capability showcase.
    Terminal,
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
    let cli = Cli::parse();
    let app_info = build_app_info();

    run(cli.command, app_info).await
}

fn build_app_info() -> AppInfo {
    AppInfo::new(
        "Aria CLI",
        env!("CARGO_PKG_VERSION"),
        option_env!("ARIA_BUILD_TIME").map(|value| value.to_owned()),
        std::env::consts::OS,
    )
}

struct BootstrapServices {
    context: BootstrapContext,
    client: DaemonClient,
    _observability: ObservabilityHandle,
}

impl BootstrapServices {
    fn load(app_info: AppInfo) -> Result<Self> {
        let context = BootstrapContext::load(AppRole::Cli, app_info)?;
        let observability = init_observability(
            context.role,
            &context.paths,
            context.config.log_level.as_str(),
        )?;
        let client = DaemonClient::new(
            std::env::var("ARIA_DAEMON_ADDR").unwrap_or_else(|_| DEFAULT_DAEMON_ADDR.to_string()),
        );

        Ok(Self {
            context,
            client,
            _observability: observability,
        })
    }
}

async fn run(command: Command, app_info: AppInfo) -> Result<()> {
    match command {
        Command::Version => print_version(&app_info),
        Command::Doctor => {
            let services = BootstrapServices::load(app_info)?;
            print_doctor(&services.context, &services.client).await?;
        }
        Command::Daemon { command } => {
            let services = BootstrapServices::load(app_info)?;
            handle_daemon_command(command, &services.client).await?;
        }
        Command::Sessions { command } => {
            let services = BootstrapServices::load(app_info)?;
            handle_session_command(command, &services.client).await?;
        }
        Command::Tools { command } => handle_tool_command(command),
    }

    Ok(())
}

fn print_version(app_info: &AppInfo) {
    println!(
        "{} {} ({})",
        app_info.name, app_info.version, app_info.platform
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
                    profile_id: None,
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

fn handle_tool_command(command: ToolCommand) {
    match command {
        ToolCommand::Terminal => {
            print!("{}", render_terminal_showcase());
        }
    }
}

fn render_terminal_showcase() -> String {
    const RESET: &str = "\x1b[0m";

    let mut output = String::new();
    let _ = writeln!(output, "\x1b[1mAria Terminal Capability Showcase{RESET}");
    let _ = writeln!(
        output,
        "A deterministic one-shot demo for colors, styles, Unicode, and hyperlink support."
    );
    let _ = writeln!(
        output,
        "No daemon connection, terminal probing, alternate screen, or animations required."
    );

    push_section_heading(&mut output, "16-Color Reference");
    push_ansi_palette_row(
        &mut output,
        "Standard FG",
        0,
        &[
            "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
        ],
    );
    push_ansi_palette_row(
        &mut output,
        "Bright FG",
        8,
        &[
            "bright black",
            "bright red",
            "bright green",
            "bright yellow",
            "bright blue",
            "bright magenta",
            "bright cyan",
            "bright white",
        ],
    );
    push_background_palette_row(&mut output, "Standard BG", 0, 8);
    push_background_palette_row(&mut output, "Bright BG", 8, 8);

    push_section_heading(&mut output, "256-Color Cube");
    let _ = writeln!(
        output,
        "6x6x6 palette cube rendered as indexed background swatches."
    );
    let _ = writeln!(
        output,
        "Indexed accents: \x1b[38;5;196mred\x1b[0m \x1b[38;5;82mgreen\x1b[0m \x1b[38;5;33mblue\x1b[0m"
    );
    for red in 0..6 {
        for green in 0..6 {
            for blue in 0..6 {
                let index = 16 + red * 36 + green * 6 + blue;
                let _ = write!(output, "\x1b[48;5;{index}m {index:>3} \x1b[0m");
            }
            output.push(' ');
        }
        output.push('\n');
    }

    let _ = writeln!(output);
    let _ = writeln!(output, "Grayscale Ramp");
    for index in 232..=255 {
        let _ = write!(output, "\x1b[48;5;{index}m {index:>3} \x1b[0m");
    }
    output.push('\n');

    push_section_heading(&mut output, "Truecolor Gradients");
    let _ = writeln!(
        output,
        "Foreground anchor: \x1b[38;2;255;0;128mhot pink\x1b[0m"
    );
    let _ = writeln!(
        output,
        "Background anchor: \x1b[48;2;0;128;255m  azure chip  \x1b[0m"
    );
    let _ = write!(output, "Foreground sweep: ");
    for step in 0..32 {
        let red = 255_u16.saturating_sub(step * 7) as u8;
        let green = ((step * 255) / 31) as u8;
        let blue = (96 + (step * 159) / 31) as u8;
        let _ = write!(output, "\x1b[38;2;{red};{green};{blue}m▇\x1b[0m");
    }
    output.push('\n');
    let _ = write!(output, "Background sweep: ");
    for step in 0..32 {
        let red = ((step * 255) / 31) as u8;
        let green = (255_u16.saturating_sub(step * 5) as u8).max(32);
        let blue = 255_u16.saturating_sub((step * 255) / 31) as u8;
        let _ = write!(output, "\x1b[48;2;{red};{green};{blue}m \x1b[0m");
    }
    output.push('\n');

    push_section_heading(&mut output, "Style Samples");
    let _ = writeln!(
        output,
        "Intensity: \x1b[1mBold\x1b[0m \x1b[2mFaint\x1b[0m \x1b[7mInverse\x1b[0m"
    );
    let _ = writeln!(
        output,
        "Text styles: \x1b[3mItalic\x1b[0m \x1b[9mStrikethrough\x1b[0m \x1b[53mOverline\x1b[0m"
    );
    let _ = writeln!(
        output,
        "Underline variants: \x1b[4:1mSingle\x1b[0m \x1b[4:2mDouble\x1b[0m \x1b[4:3mCurly\x1b[0m \x1b[4:4mDotted\x1b[0m \x1b[4:5mDashed\x1b[0m"
    );
    let _ = writeln!(
        output,
        "Reset behavior: \x1b[1;3;38;5;214mstyled\x1b[0m back to normal text"
    );

    push_section_heading(&mut output, "Unicode And Emoji");
    let _ = writeln!(output, "Emoji: 😀 🚀 🧠");
    let _ = writeln!(output, "ZWJ: 👩‍🚀 👨‍👩‍👧‍👦 🧑‍💻");
    let _ = writeln!(output, "Skin tones: 👍 👍🏽 👍🏿");
    let _ = writeln!(output, "Flags: 🇭🇰 🇯🇵 🇺🇸");
    let _ = writeln!(output, "Combining: e\u{0301} n\u{0303} o\u{0302}");
    let _ = writeln!(output, "Wide: 你好 こんにちは 안녕");
    let _ = writeln!(output, "Cell ruler: |A|好|界|🙂|🚀|");

    push_section_heading(&mut output, "Advanced Glyphs");
    let _ = writeln!(output, "Box drawing:");
    let _ = writeln!(output, "┌──────────┬──────────┐");
    let _ = writeln!(output, "│ scrollback │ viewport │");
    let _ = writeln!(output, "└──────────┴──────────┘");
    let _ = writeln!(output, "Blocks: ▁▂▃▄▅▆▇█");
    let _ = writeln!(output, "Braille: ⠁⠃⠇⠧⠷⠿");
    let _ = writeln!(output, "Powerline: \u{e0b0} \u{e0b1} \u{e0b2} \u{e0b3}");
    let _ = writeln!(
        output,
        "OSC 8 Hyperlink: {}",
        osc8_link(
            "https://example.com/aria-terminal-demo",
            "Aria terminal demo link"
        )
    );

    output.push_str(RESET);
    output.push('\n');
    output
}

fn push_section_heading(output: &mut String, title: &str) {
    if !output.is_empty() {
        output.push('\n');
    }
    let _ = writeln!(output, "\x1b[1;4m{title}\x1b[0m");
}

fn push_ansi_palette_row(output: &mut String, label: &str, start: u8, names: &[&str]) {
    let _ = write!(output, "{label}: ");
    for (offset, name) in names.iter().enumerate() {
        let index = start + offset as u8;
        let _ = write!(output, "\x1b[38;5;{index}m{name:^13}\x1b[0m");
    }
    output.push('\n');
}

fn push_background_palette_row(output: &mut String, label: &str, start: u8, count: u8) {
    let _ = write!(output, "{label}: ");
    for offset in 0..count {
        let index = start + offset;
        let _ = write!(output, "\x1b[48;5;{index}m {index:>2} \x1b[0m");
    }
    output.push('\n');
}

fn osc8_link(url: &str, label: &str) -> String {
    format!("\x1b]8;;{url}\x1b\\{label}\x1b]8;;\x1b\\")
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
    use super::{
        match_session_id, normalize_uuid_fragment, render_terminal_showcase, Cli, Command,
        ToolCommand,
    };
    use aria_ipc::SessionSummary;
    use aria_model::{SessionStatus, SessionTransportKind, TerminalSize};
    use clap::Parser;

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

    #[test]
    fn cli_parses_tools_terminal_subcommand() {
        let cli = Cli::try_parse_from(["aria-cli", "tools", "terminal"])
            .expect("parse tools terminal command");

        assert!(matches!(
            cli.command,
            Command::Tools {
                command: ToolCommand::Terminal
            }
        ));
    }

    #[test]
    fn terminal_showcase_includes_expected_sections_and_sequences() {
        let output = render_terminal_showcase();

        for header in [
            "Aria Terminal Capability Showcase",
            "16-Color Reference",
            "256-Color Cube",
            "Truecolor Gradients",
            "Style Samples",
            "Unicode And Emoji",
            "Advanced Glyphs",
        ] {
            assert!(output.contains(header), "missing header: {header}");
        }

        for sample in [
            "\u{1b}[38;5;196m",
            "\u{1b}[48;5;33m",
            "\u{1b}[38;2;255;0;128m",
            "\u{1b}[48;2;0;128;255m",
            "\u{1b}]8;;https://example.com/aria-terminal-demo",
            "Emoji: 😀 🚀 🧠",
            "Combining: e\u{0301} n\u{0303} o\u{0302}",
            "Wide: 你好 こんにちは 안녕",
        ] {
            assert!(output.contains(sample), "missing sample: {sample:?}");
        }

        assert!(output.ends_with("\u{1b}[0m\n"));
    }
}
