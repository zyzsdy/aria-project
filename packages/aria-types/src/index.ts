export const HEALTH_STATUSES = [
  "unknown",
  "starting",
  "ready",
  "degraded"
] as const;

export const SESSION_STATUSES = [
  "starting",
  "running",
  "exited",
  "closed",
  "failed"
] as const;

export const SESSION_TRANSPORTS = ["local_pty", "ssh"] as const;
export const VIEWER_ROLES = ["interactive", "observer"] as const;
export const REHYDRATE_REASONS = [
  "attach",
  "resize",
  "replay-gap",
  "server-resync"
] as const;
export const REPLAY_MODES = ["bytes", "rehydrate"] as const;
export const BUFFER_KINDS = ["primary", "alternate"] as const;
export const PAYLOAD_ENCODINGS = ["base64"] as const;
export const VIEWER_DETACHED_REASONS = [
  "client-request",
  "connection-closed",
  "session-closed",
  "server-shutdown"
] as const;
export const APP_THEME_PRESETS = ["north", "oxide", "forest"] as const;
export const CURSOR_STYLES = ["block", "underline", "bar"] as const;
export const RIGHT_CLICK_BEHAVIORS = ["paste", "menu"] as const;
export const BELL_MODES = ["off", "visual", "system"] as const;
export const STARTUP_BEHAVIORS = ["open_empty", "restore_previous"] as const;
export const CLOSE_CONFIRMATIONS = ["never", "confirm_running_sessions"] as const;
export const SETTINGS_GROUPS = ["appearance", "terminal", "workspace"] as const;

export type HealthStatus = (typeof HEALTH_STATUSES)[number];
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type SessionTransportKind = (typeof SESSION_TRANSPORTS)[number];
export type ViewerRole = (typeof VIEWER_ROLES)[number];
export type RehydrateReason = (typeof REHYDRATE_REASONS)[number];
export type ReplayMode = (typeof REPLAY_MODES)[number];
export type BufferKind = (typeof BUFFER_KINDS)[number];
export type PayloadEncoding = (typeof PAYLOAD_ENCODINGS)[number];
export type ViewerDetachedReason = (typeof VIEWER_DETACHED_REASONS)[number];
export type ThemePreset = (typeof APP_THEME_PRESETS)[number];
export type CursorStyle = (typeof CURSOR_STYLES)[number];
export type RightClickBehavior = (typeof RIGHT_CLICK_BEHAVIORS)[number];
export type BellMode = (typeof BELL_MODES)[number];
export type StartupBehavior = (typeof STARTUP_BEHAVIORS)[number];
export type CloseConfirmation = (typeof CLOSE_CONFIRMATIONS)[number];
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

export interface AppInfo {
  readonly name: string;
  readonly version: string;
  readonly buildTime: string | null;
  readonly platform: string;
}

export interface TerminalSize {
  readonly cols: number;
  readonly rows: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

export interface CursorPosition {
  readonly row: number;
  readonly col: number;
}

export interface DaemonInfo {
  readonly pid: number;
  readonly apiVersion: string;
  readonly startedAt: string | null;
  readonly role: string;
  readonly status: HealthStatus;
}

export interface HealthRequest {
  readonly verbose: boolean;
}

export interface HealthResponse {
  readonly status: HealthStatus;
  readonly app: AppInfo;
  readonly daemon: DaemonInfo | null;
  readonly message: string;
}

export interface SessionSummary {
  readonly sessionId: string;
  readonly title: string;
  readonly status: SessionStatus;
  readonly transport: SessionTransportKind;
  readonly size: TerminalSize;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AppearanceSettings {
  readonly themePreset: ThemePreset;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly cursorStyle: CursorStyle;
  readonly cursorBlink: boolean;
}

export interface TerminalSettings {
  readonly scrollbackLines: number;
  readonly rightClickBehavior: RightClickBehavior;
  readonly copyOnSelect: boolean;
  readonly bellMode: BellMode;
}

export interface WorkspaceSettings {
  readonly startupBehavior: StartupBehavior;
  readonly closeConfirmation: CloseConfirmation;
}

export interface AppSettings {
  readonly appearance: AppearanceSettings;
  readonly terminal: TerminalSettings;
  readonly workspace: WorkspaceSettings;
}

export interface AppearanceSettingsPatch {
  readonly themePreset?: ThemePreset;
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly cursorStyle?: CursorStyle;
  readonly cursorBlink?: boolean;
}

export interface TerminalSettingsPatch {
  readonly scrollbackLines?: number;
  readonly rightClickBehavior?: RightClickBehavior;
  readonly copyOnSelect?: boolean;
  readonly bellMode?: BellMode;
}

export interface WorkspaceSettingsPatch {
  readonly startupBehavior?: StartupBehavior;
  readonly closeConfirmation?: CloseConfirmation;
}

export interface UpdateAppSettingsPayload {
  readonly appearance?: AppearanceSettingsPatch;
  readonly terminal?: TerminalSettingsPatch;
  readonly workspace?: WorkspaceSettingsPatch;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  appearance: {
    themePreset: "north",
    fontFamily: "Cascadia Mono",
    fontSize: 14,
    lineHeight: 1.2,
    letterSpacing: 0,
    cursorStyle: "block",
    cursorBlink: true
  },
  terminal: {
    scrollbackLines: 2000,
    rightClickBehavior: "paste",
    copyOnSelect: false,
    bellMode: "off"
  },
  workspace: {
    startupBehavior: "restore_previous",
    closeConfirmation: "confirm_running_sessions"
  }
};

export interface SessionMetadata extends SessionSummary {
  readonly cwd: string | null;
  readonly command: readonly string[];
  readonly shell: string;
  readonly processId: number | null;
  readonly exitCode: number | null;
}

export interface ScrollbackStats {
  readonly lineCount: number;
}

export interface SessionSnapshot {
  readonly sessionId: string;
  readonly size: TerminalSize;
  readonly visibleLines: readonly string[];
  readonly cursor: CursorPosition;
  readonly alternateScreen: boolean;
  readonly scrollback: ScrollbackStats;
  readonly metadata: SessionMetadata;
}

export interface CreateLocalSessionResponse {
  readonly sessionId: string;
  readonly summary: SessionSummary;
}

export interface AttachViewerResponse {
  readonly viewerId: string;
  readonly sessionId: string;
  readonly acceptedRole: ViewerRole;
  readonly replayMode: ReplayMode;
  readonly nextExpectedSeq: number;
}

export interface SessionStreamMetadata {
  readonly title: string;
  readonly status: SessionStatus;
  readonly cwd: string | null;
  readonly shell: string;
  readonly processId: number | null;
  readonly exitCode: number | null;
}

export interface SessionMetadataDelta {
  readonly title?: string;
  readonly status?: SessionStatus;
  readonly cwd?: string | null;
  readonly shell?: string;
  readonly processId?: number | null;
  readonly exitCode?: number | null;
}

export interface TerminalRehydrateFrame {
  readonly type: "terminal.rehydrate";
  readonly seq: number;
  readonly sessionId: string;
  readonly viewerId: string;
  readonly reason: RehydrateReason;
  readonly activeBuffer: BufferKind;
  readonly size: TerminalSize;
  readonly payloadEncoding: PayloadEncoding;
  readonly vtPayload: string;
  readonly metadata: SessionStreamMetadata;
}

export interface TerminalBytesFrame {
  readonly type: "terminal.bytes";
  readonly seq: number;
  readonly sessionId: string;
  readonly viewerId: string;
  readonly payloadEncoding: PayloadEncoding;
  readonly bytes: string;
}

export interface SessionMetadataFrame {
  readonly type: "session.metadata";
  readonly seq: number;
  readonly sessionId: string;
  readonly viewerId: string;
  readonly metadata: SessionMetadataDelta;
}

export interface ViewerDetachedFrame {
  readonly type: "viewer.detached";
  readonly seq: number;
  readonly sessionId: string;
  readonly viewerId: string;
  readonly reason: ViewerDetachedReason;
}

export type SessionStreamFrame =
  | TerminalRehydrateFrame
  | TerminalBytesFrame
  | SessionMetadataFrame
  | ViewerDetachedFrame;
