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

export type HealthStatus = (typeof HEALTH_STATUSES)[number];
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type SessionTransportKind = (typeof SESSION_TRANSPORTS)[number];

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
