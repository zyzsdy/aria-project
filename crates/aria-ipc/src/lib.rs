use aria_model::{
    AppInfo, CursorPosition, HealthStatus, SessionId, SessionStatus, SessionTransportKind,
    TerminalSize, ViewerId,
};
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::TcpStream,
    time::timeout,
};

pub const DEFAULT_DAEMON_ADDR: &str = "127.0.0.1:45783";
const DEFAULT_RPC_TIMEOUT_MS: u64 = 2_500;
pub const BUILTIN_POWERSHELL_PROFILE_ID: &str = "builtin:powershell";
pub const BUILTIN_CMD_PROFILE_ID: &str = "builtin:cmd";
pub const BUILTIN_SYSTEM_PROFILE_ID: &str = "builtin:system";

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthRequest {
    pub verbose: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonInfo {
    pub pid: u32,
    pub api_version: String,
    pub started_at: Option<String>,
    pub role: String,
    pub status: HealthStatus,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: HealthStatus,
    pub app: AppInfo,
    pub daemon: Option<DaemonInfo>,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLocalSessionRequest {
    pub size: TerminalSize,
    pub cwd: Option<String>,
    pub command: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLocalSessionResponse {
    pub session_id: SessionId,
    pub summary: SessionSummary,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSessionsRequest;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSessionsResponse {
    pub sessions: Vec<SessionSummary>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub session_id: SessionId,
    pub title: String,
    pub status: SessionStatus,
    pub transport: SessionTransportKind,
    pub size: TerminalSize,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMetadata {
    pub session_id: SessionId,
    pub title: String,
    pub status: SessionStatus,
    pub transport: SessionTransportKind,
    pub size: TerminalSize,
    pub created_at: String,
    pub updated_at: String,
    pub cwd: Option<String>,
    pub command: Vec<String>,
    pub shell: String,
    pub process_id: Option<u32>,
    pub exit_code: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrollbackStats {
    pub line_count: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub session_id: SessionId,
    pub size: TerminalSize,
    pub visible_lines: Vec<String>,
    pub cursor: CursorPosition,
    pub alternate_screen: bool,
    pub scrollback: ScrollbackStats,
    pub metadata: SessionMetadata,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSelector {
    pub session_id: SessionId,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionWriteRequest {
    pub session_id: SessionId,
    pub data: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionResizeRequest {
    pub session_id: SessionId,
    pub size: TerminalSize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameSessionRequest {
    pub session_id: SessionId,
    pub title: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmptyResponse {}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThemePreset {
    #[default]
    North,
    Oxide,
    Forest,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CursorStyle {
    #[default]
    Block,
    Underline,
    Bar,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RightClickBehavior {
    #[default]
    Paste,
    Menu,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BellMode {
    #[default]
    Off,
    Visual,
    System,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StartupBehavior {
    OpenEmpty,
    #[default]
    RestorePrevious,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CloseConfirmation {
    Never,
    #[default]
    ConfirmRunningSessions,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProfileSource {
    #[default]
    Builtin,
    Custom,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SettingsGroup {
    Appearance,
    Terminal,
    Workspace,
    Localization,
    Profiles,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    pub theme_preset: ThemePreset,
    pub font_family: String,
    pub font_size: u16,
    pub line_height: f32,
    pub letter_spacing: i16,
    pub cursor_style: CursorStyle,
    pub cursor_blink: bool,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            theme_preset: ThemePreset::North,
            font_family: "Cascadia Mono".to_string(),
            font_size: 14,
            line_height: 1.2,
            letter_spacing: 0,
            cursor_style: CursorStyle::Block,
            cursor_blink: true,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSettings {
    pub scrollback_lines: usize,
    pub right_click_behavior: RightClickBehavior,
    pub bell_mode: BellMode,
}

impl Default for TerminalSettings {
    fn default() -> Self {
        Self {
            scrollback_lines: 2_000,
            right_click_behavior: RightClickBehavior::Paste,
            bell_mode: BellMode::Off,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSettings {
    pub startup_behavior: StartupBehavior,
    pub close_confirmation: CloseConfirmation,
}

impl Default for WorkspaceSettings {
    fn default() -> Self {
        Self {
            startup_behavior: StartupBehavior::RestorePrevious,
            close_confirmation: CloseConfirmation::ConfirmRunningSessions,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationSettings {
    pub locale: String,
}

impl Default for LocalizationSettings {
    fn default() -> Self {
        Self {
            locale: "system".to_string(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct ShellProfile {
    pub id: String,
    pub source: ProfileSource,
    pub name: String,
    pub executable: String,
    pub args: Vec<String>,
    pub startup_dir: Option<String>,
}

impl Default for ShellProfile {
    fn default() -> Self {
        Self {
            id: BUILTIN_SYSTEM_PROFILE_ID.to_string(),
            source: ProfileSource::Builtin,
            name: "Default Shell".to_string(),
            executable: default_system_shell_executable(),
            args: Vec::new(),
            startup_dir: None,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct ProfilesSettings {
    pub default_profile_id: String,
    pub items: Vec<ShellProfile>,
}

impl Default for ProfilesSettings {
    fn default() -> Self {
        Self {
            default_profile_id: platform_default_profile_id().to_string(),
            items: platform_builtin_profiles(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(default)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub appearance: AppearanceSettings,
    pub terminal: TerminalSettings,
    pub workspace: WorkspaceSettings,
    pub localization: LocalizationSettings,
    pub profiles: ProfilesSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            appearance: AppearanceSettings::default(),
            terminal: TerminalSettings::default(),
            workspace: WorkspaceSettings::default(),
            localization: LocalizationSettings::default(),
            profiles: ProfilesSettings::default(),
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettingsPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub theme_preset: Option<ThemePreset>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub font_size: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub letter_spacing: Option<i16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor_style: Option<CursorStyle>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cursor_blink: Option<bool>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSettingsPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scrollback_lines: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub right_click_behavior: Option<RightClickBehavior>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bell_mode: Option<BellMode>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSettingsPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub startup_behavior: Option<StartupBehavior>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub close_confirmation: Option<CloseConfirmation>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalizationSettingsPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilesSettingsPatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_profile_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<Vec<ShellProfile>>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAppSettingsPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub appearance: Option<AppearanceSettingsPatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal: Option<TerminalSettingsPatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace: Option<WorkspaceSettingsPatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub localization: Option<LocalizationSettingsPatch>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profiles: Option<ProfilesSettingsPatch>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetSettingsRequest;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettingsRequest {
    pub settings: UpdateAppSettingsPayload,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetSettingsGroupRequest {
    pub group: SettingsGroup,
}

pub fn platform_default_profile_id() -> &'static str {
    if cfg!(target_os = "windows") {
        BUILTIN_POWERSHELL_PROFILE_ID
    } else {
        BUILTIN_SYSTEM_PROFILE_ID
    }
}

pub fn platform_builtin_profiles() -> Vec<ShellProfile> {
    if cfg!(target_os = "windows") {
        vec![
            ShellProfile {
                id: BUILTIN_POWERSHELL_PROFILE_ID.to_string(),
                source: ProfileSource::Builtin,
                name: "PowerShell".to_string(),
                executable: "powershell.exe".to_string(),
                args: Vec::new(),
                startup_dir: None,
            },
            ShellProfile {
                id: BUILTIN_CMD_PROFILE_ID.to_string(),
                source: ProfileSource::Builtin,
                name: "Command Prompt".to_string(),
                executable: std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string()),
                args: Vec::new(),
                startup_dir: None,
            },
        ]
    } else {
        vec![ShellProfile {
            id: BUILTIN_SYSTEM_PROFILE_ID.to_string(),
            source: ProfileSource::Builtin,
            name: "Default Shell".to_string(),
            executable: default_system_shell_executable(),
            args: Vec::new(),
            startup_dir: None,
        }]
    }
}

fn default_system_shell_executable() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ViewerRole {
    Interactive,
    Observer,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RehydrateReason {
    Attach,
    Resize,
    ReplayGap,
    ServerResync,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReplayMode {
    Bytes,
    Rehydrate,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BufferKind {
    Primary,
    Alternate,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PayloadEncoding {
    Base64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ViewerDetachedReason {
    ClientRequest,
    ConnectionClosed,
    SessionClosed,
    ServerShutdown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachViewerRequest {
    pub session_id: SessionId,
    pub role: ViewerRole,
    pub viewport: TerminalSize,
    pub replay_from_seq: Option<u64>,
    pub rehydrate_scrollback_lines: Option<usize>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachViewerResponse {
    pub viewer_id: ViewerId,
    pub session_id: SessionId,
    pub accepted_role: ViewerRole,
    pub replay_mode: ReplayMode,
    pub next_expected_seq: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetachViewerRequest {
    pub viewer_id: ViewerId,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewerAckRequest {
    pub viewer_id: ViewerId,
    pub seq: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadScrollbackRequest {
    pub session_id: SessionId,
    pub before_line_id: Option<u64>,
    pub limit: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrollbackLine {
    pub line_id: u64,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadScrollbackResponse {
    pub session_id: SessionId,
    pub first_available_line_id: Option<u64>,
    pub last_available_line_id: Option<u64>,
    pub has_more_above: bool,
    pub lines: Vec<ScrollbackLine>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStreamMetadata {
    pub title: String,
    pub status: SessionStatus,
    pub cwd: Option<String>,
    pub shell: String,
    pub process_id: Option<u32>,
    pub exit_code: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMetadataDelta {
    pub title: Option<String>,
    pub status: Option<SessionStatus>,
    pub cwd: Option<String>,
    pub shell: Option<String>,
    pub process_id: Option<u32>,
    pub exit_code: Option<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum SessionStreamFrame {
    #[serde(rename = "terminal.rehydrate", rename_all = "camelCase")]
    TerminalRehydrate {
        seq: u64,
        session_id: SessionId,
        viewer_id: ViewerId,
        reason: RehydrateReason,
        active_buffer: BufferKind,
        size: TerminalSize,
        payload_encoding: PayloadEncoding,
        vt_payload: String,
        metadata: SessionStreamMetadata,
    },
    #[serde(rename = "terminal.bytes", rename_all = "camelCase")]
    TerminalBytes {
        seq: u64,
        session_id: SessionId,
        viewer_id: ViewerId,
        payload_encoding: PayloadEncoding,
        bytes: String,
    },
    #[serde(rename = "session.metadata", rename_all = "camelCase")]
    SessionMetadata {
        seq: u64,
        session_id: SessionId,
        viewer_id: ViewerId,
        metadata: SessionMetadataDelta,
    },
    #[serde(rename = "viewer.detached", rename_all = "camelCase")]
    ViewerDetached {
        seq: u64,
        session_id: SessionId,
        viewer_id: ViewerId,
        reason: ViewerDetachedReason,
    },
}

impl SessionStreamFrame {
    pub fn seq(&self) -> u64 {
        match self {
            Self::TerminalRehydrate { seq, .. }
            | Self::TerminalBytes { seq, .. }
            | Self::SessionMetadata { seq, .. }
            | Self::ViewerDetached { seq, .. } => *seq,
        }
    }

    pub fn terminal_rehydrate(
        seq: u64,
        session_id: SessionId,
        viewer_id: ViewerId,
        reason: RehydrateReason,
        active_buffer: BufferKind,
        size: TerminalSize,
        vt_payload: impl AsRef<[u8]>,
        metadata: SessionStreamMetadata,
    ) -> Self {
        Self::TerminalRehydrate {
            seq,
            session_id,
            viewer_id,
            reason,
            active_buffer,
            size,
            payload_encoding: PayloadEncoding::Base64,
            vt_payload: BASE64_STANDARD.encode(vt_payload.as_ref()),
            metadata,
        }
    }

    pub fn terminal_bytes(
        seq: u64,
        session_id: SessionId,
        viewer_id: ViewerId,
        bytes: impl AsRef<[u8]>,
    ) -> Self {
        Self::TerminalBytes {
            seq,
            session_id,
            viewer_id,
            payload_encoding: PayloadEncoding::Base64,
            bytes: BASE64_STANDARD.encode(bytes.as_ref()),
        }
    }

    pub fn decode_base64(payload: &str) -> Result<Vec<u8>, base64::DecodeError> {
        BASE64_STANDARD.decode(payload)
    }
}

#[derive(Debug, Error)]
pub enum ContractError {
    #[error("service unavailable: {0}")]
    Unavailable(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcRequest {
    pub method: String,
    pub payload: serde_json::Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcResponse {
    pub ok: bool,
    pub payload: Option<serde_json::Value>,
    pub error: Option<String>,
}

#[derive(Debug, Error)]
pub enum ClientError {
    #[error("failed to connect to daemon at {addr}: {source}")]
    Connect {
        addr: String,
        #[source]
        source: std::io::Error,
    },

    #[error("daemon RPC timed out after {0}ms")]
    Timeout(u64),

    #[error("I/O error while talking to daemon: {0}")]
    Io(#[source] std::io::Error),

    #[error("failed to serialize daemon request: {0}")]
    Serialize(#[source] serde_json::Error),

    #[error("failed to deserialize daemon response: {0}")]
    Deserialize(#[source] serde_json::Error),

    #[error("daemon returned an error: {0}")]
    Remote(String),

    #[error("daemon returned an invalid response")]
    InvalidResponse,
}

#[async_trait]
pub trait HealthService: Send + Sync {
    async fn ping(&self, request: HealthRequest) -> Result<HealthResponse, ContractError>;
}

#[async_trait]
pub trait SessionService: Send + Sync {
    async fn list_sessions(
        &self,
        request: ListSessionsRequest,
    ) -> Result<ListSessionsResponse, ContractError>;

    async fn create_local_session(
        &self,
        request: CreateLocalSessionRequest,
    ) -> Result<CreateLocalSessionResponse, ContractError>;

    async fn get_session_snapshot(
        &self,
        request: SessionSelector,
    ) -> Result<SessionSnapshot, ContractError>;

    async fn get_session_metadata(
        &self,
        request: SessionSelector,
    ) -> Result<SessionMetadata, ContractError>;

    async fn write_session(
        &self,
        request: SessionWriteRequest,
    ) -> Result<EmptyResponse, ContractError>;

    async fn resize_session(
        &self,
        request: SessionResizeRequest,
    ) -> Result<EmptyResponse, ContractError>;

    async fn close_session(
        &self,
        request: SessionSelector,
    ) -> Result<EmptyResponse, ContractError>;

    async fn rename_session(
        &self,
        request: RenameSessionRequest,
    ) -> Result<EmptyResponse, ContractError>;

    async fn detach_viewer(
        &self,
        request: DetachViewerRequest,
    ) -> Result<EmptyResponse, ContractError>;

    async fn viewer_ack(&self, request: ViewerAckRequest) -> Result<EmptyResponse, ContractError>;

    async fn read_scrollback(
        &self,
        request: ReadScrollbackRequest,
    ) -> Result<ReadScrollbackResponse, ContractError>;
}

#[async_trait]
pub trait SettingsService: Send + Sync {
    async fn get_settings(
        &self,
        request: GetSettingsRequest,
    ) -> Result<AppSettings, ContractError>;

    async fn update_settings(
        &self,
        request: UpdateSettingsRequest,
    ) -> Result<AppSettings, ContractError>;

    async fn reset_settings_group(
        &self,
        request: ResetSettingsGroupRequest,
    ) -> Result<AppSettings, ContractError>;
}

#[derive(Clone, Debug)]
pub struct DaemonClient {
    addr: String,
    timeout: Duration,
}

impl Default for DaemonClient {
    fn default() -> Self {
        Self::new(DEFAULT_DAEMON_ADDR)
    }
}

impl DaemonClient {
    pub fn new(addr: impl Into<String>) -> Self {
        Self {
            addr: addr.into(),
            timeout: Duration::from_millis(DEFAULT_RPC_TIMEOUT_MS),
        }
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn addr(&self) -> &str {
        &self.addr
    }

    pub async fn health_ping(&self, request: HealthRequest) -> Result<HealthResponse, ClientError> {
        self.call("health.ping", &request).await
    }

    pub async fn list_sessions(
        &self,
        request: ListSessionsRequest,
    ) -> Result<ListSessionsResponse, ClientError> {
        self.call("sessions.list", &request).await
    }

    pub async fn create_local_session(
        &self,
        request: CreateLocalSessionRequest,
    ) -> Result<CreateLocalSessionResponse, ClientError> {
        self.call("sessions.createLocal", &request).await
    }

    pub async fn get_session_snapshot(
        &self,
        request: SessionSelector,
    ) -> Result<SessionSnapshot, ClientError> {
        self.call("sessions.getSnapshot", &request).await
    }

    pub async fn get_session_metadata(
        &self,
        request: SessionSelector,
    ) -> Result<SessionMetadata, ClientError> {
        self.call("sessions.getMetadata", &request).await
    }

    pub async fn write_session(
        &self,
        request: SessionWriteRequest,
    ) -> Result<EmptyResponse, ClientError> {
        self.call("sessions.write", &request).await
    }

    pub async fn resize_session(
        &self,
        request: SessionResizeRequest,
    ) -> Result<EmptyResponse, ClientError> {
        self.call("sessions.resize", &request).await
    }

    pub async fn close_session(
        &self,
        request: SessionSelector,
    ) -> Result<EmptyResponse, ClientError> {
        self.call("sessions.close", &request).await
    }

    pub async fn rename_session(
        &self,
        request: RenameSessionRequest,
    ) -> Result<EmptyResponse, ClientError> {
        self.call("sessions.rename", &request).await
    }

    pub async fn detach_viewer(
        &self,
        request: DetachViewerRequest,
    ) -> Result<EmptyResponse, ClientError> {
        self.call("sessions.detachViewer", &request).await
    }

    pub async fn viewer_ack(
        &self,
        request: ViewerAckRequest,
    ) -> Result<EmptyResponse, ClientError> {
        self.call("sessions.viewerAck", &request).await
    }

    pub async fn read_scrollback(
        &self,
        request: ReadScrollbackRequest,
    ) -> Result<ReadScrollbackResponse, ClientError> {
        self.call("sessions.readScrollback", &request).await
    }

    pub async fn get_settings(
        &self,
        request: GetSettingsRequest,
    ) -> Result<AppSettings, ClientError> {
        self.call("settings.get", &request).await
    }

    pub async fn update_settings(
        &self,
        request: UpdateSettingsRequest,
    ) -> Result<AppSettings, ClientError> {
        self.call("settings.update", &request).await
    }

    pub async fn reset_settings_group(
        &self,
        request: ResetSettingsGroupRequest,
    ) -> Result<AppSettings, ClientError> {
        self.call("settings.resetGroup", &request).await
    }

    pub async fn call<Req, Resp>(&self, method: &str, payload: &Req) -> Result<Resp, ClientError>
    where
        Req: Serialize + ?Sized,
        Resp: DeserializeOwned,
    {
        let request = RpcRequest {
            method: method.to_string(),
            payload: serde_json::to_value(payload).map_err(ClientError::Serialize)?,
        };

        let encoded = serde_json::to_vec(&request).map_err(ClientError::Serialize)?;
        let mut stream = timeout(self.timeout, TcpStream::connect(&self.addr))
            .await
            .map_err(|_| ClientError::Timeout(self.timeout.as_millis() as u64))?
            .map_err(|source| ClientError::Connect {
                addr: self.addr.clone(),
                source,
            })?;
        stream.write_all(&encoded).await.map_err(ClientError::Io)?;
        stream.write_all(b"\n").await.map_err(ClientError::Io)?;
        stream.flush().await.map_err(ClientError::Io)?;

        let mut line = String::new();
        let mut reader = BufReader::new(stream);
        timeout(self.timeout, reader.read_line(&mut line))
            .await
            .map_err(|_| ClientError::Timeout(self.timeout.as_millis() as u64))?
            .map_err(ClientError::Io)?;

        if line.trim().is_empty() {
            return Err(ClientError::InvalidResponse);
        }

        let response: RpcResponse =
            serde_json::from_str(&line).map_err(ClientError::Deserialize)?;

        if !response.ok {
            return Err(ClientError::Remote(
                response
                    .error
                    .unwrap_or_else(|| "unknown error".to_string()),
            ));
        }

        let payload = response.payload.ok_or(ClientError::InvalidResponse)?;
        serde_json::from_value(payload).map_err(ClientError::Deserialize)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        AppSettings, AttachViewerRequest, BufferKind, CloseConfirmation,
        CreateLocalSessionRequest, DaemonInfo, HealthRequest, HealthResponse, PayloadEncoding,
        ReadScrollbackResponse, ReplayMode, RehydrateReason, ResetSettingsGroupRequest,
        RightClickBehavior, RpcRequest, RpcResponse, ScrollbackLine, ScrollbackStats,
        SessionMetadata, SessionMetadataDelta, SessionSnapshot, SessionStreamFrame,
        SessionStreamMetadata, SessionSummary, SettingsGroup, StartupBehavior, ThemePreset,
        UpdateAppSettingsPayload, UpdateSettingsRequest, ViewerRole,
    };
    use aria_model::{
        AppInfo, CursorPosition, HealthStatus, SessionId, SessionStatus, SessionTransportKind,
        TerminalSize, ViewerId,
    };

    #[test]
    fn health_response_round_trips() {
        let response = HealthResponse {
            status: HealthStatus::Ready,
            app: AppInfo::new("Aria", "0.1.0", None, "windows"),
            daemon: Some(DaemonInfo {
                pid: 1000,
                api_version: "phase0".to_string(),
                started_at: None,
                role: "daemon".to_string(),
                status: HealthStatus::Ready,
            }),
            message: "ok".to_string(),
        };

        let json = serde_json::to_string(&response).expect("serialize health response");
        let decoded: HealthResponse =
            serde_json::from_str(&json).expect("deserialize health response");

        assert_eq!(decoded.message, "ok");
        assert!(decoded.daemon.is_some());
        assert!(!HealthRequest::default().verbose);
    }

    #[test]
    fn session_snapshot_round_trips() {
        let session_id = SessionId::new();
        let snapshot = SessionSnapshot {
            session_id,
            size: TerminalSize::new(80, 24),
            visible_lines: vec!["hello".to_string()],
            cursor: CursorPosition { row: 1, col: 5 },
            alternate_screen: false,
            scrollback: ScrollbackStats { line_count: 12 },
            metadata: SessionMetadata {
                session_id,
                title: "powershell".to_string(),
                status: SessionStatus::Running,
                transport: SessionTransportKind::LocalPty,
                size: TerminalSize::new(80, 24),
                created_at: "1".to_string(),
                updated_at: "2".to_string(),
                cwd: Some("C:/".to_string()),
                command: vec!["powershell.exe".to_string()],
                shell: "powershell.exe".to_string(),
                process_id: Some(42),
                exit_code: None,
            },
        };

        let json = serde_json::to_string(&snapshot).expect("serialize session snapshot");
        let decoded: SessionSnapshot =
            serde_json::from_str(&json).expect("deserialize session snapshot");

        assert_eq!(decoded.visible_lines[0], "hello");
        assert_eq!(decoded.metadata.transport, SessionTransportKind::LocalPty);
    }

    #[test]
    fn rpc_request_round_trips() {
        let request = RpcRequest {
            method: "sessions.list".to_string(),
            payload: serde_json::json!({}),
        };
        let response = RpcResponse {
            ok: true,
            payload: Some(
                serde_json::to_value(SessionSummary {
                    session_id: SessionId::new(),
                    title: "shell".to_string(),
                    status: SessionStatus::Running,
                    transport: SessionTransportKind::LocalPty,
                    size: TerminalSize::new(80, 24),
                    created_at: "1".to_string(),
                    updated_at: "1".to_string(),
                })
                .expect("serialize summary"),
            ),
            error: None,
        };

        let request_json = serde_json::to_string(&request).expect("serialize request");
        let response_json = serde_json::to_string(&response).expect("serialize response");

        assert!(request_json.contains("sessions.list"));
        assert!(response_json.contains("\"ok\":true"));
    }

    #[test]
    fn stream_frame_round_trips_with_base64_payload() {
        let session_id = SessionId::new();
        let viewer_id = ViewerId::new();
        let frame = SessionStreamFrame::terminal_rehydrate(
            7,
            session_id,
            viewer_id,
            RehydrateReason::Attach,
            BufferKind::Primary,
            TerminalSize::new(80, 24),
            b"\x1b[?25lhello",
            SessionStreamMetadata {
                title: "powershell".to_string(),
                status: SessionStatus::Running,
                cwd: Some("C:/repo".to_string()),
                shell: "powershell.exe".to_string(),
                process_id: Some(42),
                exit_code: None,
            },
        );

        let json = serde_json::to_string(&frame).expect("serialize frame");
        let decoded: SessionStreamFrame = serde_json::from_str(&json).expect("deserialize frame");

        match decoded {
            SessionStreamFrame::TerminalRehydrate {
                seq,
                payload_encoding,
                vt_payload,
                ..
            } => {
                assert_eq!(seq, 7);
                assert_eq!(payload_encoding, PayloadEncoding::Base64);
                assert_eq!(
                    SessionStreamFrame::decode_base64(&vt_payload).expect("decode frame payload"),
                    b"\x1b[?25lhello"
                );
            }
            other => panic!("unexpected frame: {other:?}"),
        }
    }

    #[test]
    fn stream_frame_serializes_with_camel_case_field_names() {
        let frame = SessionStreamFrame::terminal_rehydrate(
            1,
            SessionId::new(),
            ViewerId::new(),
            RehydrateReason::Attach,
            BufferKind::Primary,
            TerminalSize::new(80, 24),
            b"hello",
            SessionStreamMetadata {
                title: "powershell".to_string(),
                status: SessionStatus::Running,
                cwd: Some("C:/repo".to_string()),
                shell: "powershell.exe".to_string(),
                process_id: Some(42),
                exit_code: None,
            },
        );

        let json = serde_json::to_value(&frame).expect("serialize frame to value");

        assert_eq!(json.get("sessionId").and_then(|value| value.as_str()).is_some(), true);
        assert_eq!(json.get("viewerId").and_then(|value| value.as_str()).is_some(), true);
        assert_eq!(
            json.get("activeBuffer").and_then(|value| value.as_str()),
            Some("primary")
        );
        assert_eq!(
            json.get("payloadEncoding").and_then(|value| value.as_str()),
            Some("base64")
        );
        assert_eq!(json.get("vtPayload").and_then(|value| value.as_str()).is_some(), true);

        assert!(json.get("session_id").is_none());
        assert!(json.get("viewer_id").is_none());
        assert!(json.get("active_buffer").is_none());
        assert!(json.get("payload_encoding").is_none());
        assert!(json.get("vt_payload").is_none());
    }

    #[test]
    fn attach_viewer_request_round_trips() {
        let request = AttachViewerRequest {
            session_id: SessionId::new(),
            role: ViewerRole::Interactive,
            viewport: TerminalSize::new(100, 28),
            replay_from_seq: Some(15),
            rehydrate_scrollback_lines: Some(200),
        };

        let json = serde_json::to_string(&request).expect("serialize attach request");
        let decoded: AttachViewerRequest =
            serde_json::from_str(&json).expect("deserialize attach request");

        assert_eq!(decoded.role, ViewerRole::Interactive);
        assert_eq!(decoded.replay_from_seq, Some(15));
        assert_eq!(decoded.rehydrate_scrollback_lines, Some(200));
    }

    #[test]
    fn read_scrollback_response_round_trips() {
        let response = ReadScrollbackResponse {
            session_id: SessionId::new(),
            first_available_line_id: Some(1),
            last_available_line_id: Some(4),
            has_more_above: true,
            lines: vec![
                ScrollbackLine {
                    line_id: 3,
                    text: "git status".to_string(),
                },
                ScrollbackLine {
                    line_id: 4,
                    text: "On branch main".to_string(),
                },
            ],
        };

        let json = serde_json::to_string(&response).expect("serialize scrollback response");
        let decoded: ReadScrollbackResponse =
            serde_json::from_str(&json).expect("deserialize scrollback response");

        assert!(decoded.has_more_above);
        assert_eq!(decoded.lines.len(), 2);
        assert_eq!(decoded.lines[0].line_id, 3);
    }

    #[test]
    fn metadata_delta_round_trips() {
        let delta = SessionMetadataDelta {
            title: Some("pwsh".to_string()),
            status: Some(SessionStatus::Exited),
            cwd: None,
            shell: Some("pwsh.exe".to_string()),
            process_id: None,
            exit_code: Some(0),
        };

        let json = serde_json::to_string(&delta).expect("serialize metadata delta");
        let decoded: SessionMetadataDelta =
            serde_json::from_str(&json).expect("deserialize metadata delta");

        assert_eq!(decoded.status, Some(SessionStatus::Exited));
        assert_eq!(decoded.exit_code, Some(0));
    }

    #[test]
    fn replay_mode_serializes_in_snake_case() {
        let json = serde_json::to_string(&ReplayMode::Rehydrate).expect("serialize replay mode");
        assert_eq!(json, "\"rehydrate\"");
    }

    #[test]
    fn app_settings_round_trip_with_expected_defaults() {
        let settings = AppSettings::default();
        let json = serde_json::to_string(&settings).expect("serialize app settings");
        let decoded: AppSettings = serde_json::from_str(&json).expect("deserialize app settings");
        let value = serde_json::to_value(&settings).expect("serialize settings value");

        assert_eq!(decoded.appearance.theme_preset, ThemePreset::North);
        assert_eq!(decoded.terminal.right_click_behavior, RightClickBehavior::Paste);
        assert_eq!(
            decoded.workspace.close_confirmation,
            CloseConfirmation::ConfirmRunningSessions
        );
        assert_eq!(decoded.workspace.startup_behavior, StartupBehavior::RestorePrevious);
        assert_eq!(decoded.localization.locale, "system");
        assert!(value.get("profiles").is_some());
        let profiles = value
            .get("profiles")
            .and_then(|profiles| profiles.get("items"))
            .and_then(|items| items.as_array())
            .expect("profiles.items array");
        assert!(!profiles.is_empty());
        assert!(
            value.get("profiles")
                .and_then(|profiles| profiles.get("defaultProfileId"))
                .and_then(|profile| profile.as_str())
                .is_some()
        );
    }

    #[test]
    fn settings_requests_serialize_with_camel_case_shape() {
        let update = serde_json::to_value(UpdateSettingsRequest {
            settings: UpdateAppSettingsPayload::default(),
        })
        .expect("serialize update settings request");
        let reset = serde_json::to_value(ResetSettingsGroupRequest {
            group: SettingsGroup::Appearance,
        })
        .expect("serialize reset settings request");
        let localization = serde_json::to_value(ResetSettingsGroupRequest {
            group: SettingsGroup::Localization,
        })
        .expect("serialize localization reset settings request");
        let profile = serde_json::to_value(serde_json::json!({
            "group": "profiles"
        }))
        .expect("serialize profile reset settings request");

        assert!(update.get("settings").is_some());
        assert_eq!(
            reset.get("group").and_then(|value| value.as_str()),
            Some("appearance")
        );
        assert_eq!(
            localization.get("group").and_then(|value| value.as_str()),
            Some("localization")
        );
        assert_eq!(
            profile.get("group").and_then(|value| value.as_str()),
            Some("profiles")
        );
    }

    #[test]
    fn create_local_session_request_round_trips_profile_id() {
        let request = serde_json::json!({
            "size": {
                "cols": 120,
                "rows": 32,
                "pixelWidth": 0,
                "pixelHeight": 0
            },
            "cwd": "C:/Users/tester",
            "command": ["pwsh.exe", "-NoLogo"],
            "profileId": "builtin:powershell"
        });

        let decoded: CreateLocalSessionRequest =
            serde_json::from_value(request).expect("deserialize create session request");
        let encoded = serde_json::to_value(decoded).expect("serialize create session request");

        assert_eq!(
            encoded.get("profileId").and_then(|value| value.as_str()),
            Some("builtin:powershell")
        );
    }
}


