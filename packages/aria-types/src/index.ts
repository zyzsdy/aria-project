export const HEALTH_STATUSES = [
  "unknown",
  "starting",
  "ready",
  "degraded"
] as const;

export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export interface AppInfo {
  readonly name: string;
  readonly version: string;
  readonly buildTime: string | null;
  readonly platform: string;
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
