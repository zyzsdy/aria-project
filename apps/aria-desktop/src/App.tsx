import { invoke } from "@tauri-apps/api/core";
import type {
  CreateLocalSessionResponse,
  HealthResponse,
  SessionSnapshot,
  SessionSummary
} from "@aria/types";
import { HEALTH_STATUSES, SESSION_STATUSES } from "@aria/types";
import { useEffect, useState } from "react";

const FALLBACK_HEALTH: HealthResponse = {
  status: "starting",
  app: {
    name: "Aria Desktop",
    version: "0.1.0",
    buildTime: null,
    platform: navigator.platform
  },
  daemon: null,
  message: "waiting for daemon"
};

export function App() {
  const [health, setHealth] = useState<HealthResponse>(FALLBACK_HEALTH);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshAll();
  }, []);

  async function refreshAll(preferredSessionId?: string) {
    setBusy(true);
    setTransportError(null);

    try {
      const nextHealth = await invoke<HealthResponse>("daemon_health");
      const nextSessions = await invoke<SessionSummary[]>("list_sessions");
      setHealth(nextHealth);
      setSessions(nextSessions);

      const nextSelectedSessionId =
        preferredSessionId &&
        nextSessions.some((session) => session.sessionId === preferredSessionId)
          ? preferredSessionId
          : selectedSessionId &&
              nextSessions.some((session) => session.sessionId === selectedSessionId)
          ? selectedSessionId
          : nextSessions[0]?.sessionId ?? null;
      setSelectedSessionId(nextSelectedSessionId);

      if (nextSelectedSessionId) {
        const nextSnapshot = await invoke<SessionSnapshot>("get_session_snapshot", {
          sessionId: nextSelectedSessionId
        });
        setSnapshot(nextSnapshot);
      } else {
        setSnapshot(null);
      }
    } catch (error) {
      setTransportError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSession() {
    setBusy(true);
    setTransportError(null);

    try {
      const created = await invoke<CreateLocalSessionResponse>("create_local_session", {
        cols: 100,
        rows: 28
      });
      setSelectedSessionId(created.sessionId);
      await refreshAll(created.sessionId);
    } catch (error) {
      setTransportError(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  async function handleSelectSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    setBusy(true);
    setTransportError(null);

    try {
      const nextSnapshot = await invoke<SessionSnapshot>("get_session_snapshot", { sessionId });
      setSnapshot(nextSnapshot);
    } catch (error) {
      setTransportError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Phase 1 Session Core</p>
          <h1>Aria Terminal</h1>
          <p className="lede">
            Desktop now talks to a real daemon. Local PTY sessions, structured
            snapshots, and minimal RPC debugging are available before the renderer lands.
          </p>
          <div className="actions">
            <button onClick={() => void refreshAll()} disabled={busy}>
              Refresh
            </button>
            <button onClick={() => void handleCreateSession()} disabled={busy}>
              New Local Shell
            </button>
          </div>
        </div>
        <div className="hero-card">
          <span className={`status status-${health.status}`}>{health.status}</span>
          <h2>{health.app.name}</h2>
          <p>{health.message}</p>
          <dl>
            <div>
              <dt>Version</dt>
              <dd>{health.app.version}</dd>
            </div>
            <div>
              <dt>Platform</dt>
              <dd>{health.app.platform}</dd>
            </div>
            <div>
              <dt>Daemon PID</dt>
              <dd>{health.daemon?.pid ?? "offline"}</dd>
            </div>
            <div>
              <dt>Started</dt>
              <dd>{health.daemon?.startedAt ?? "n/a"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <div className="panel-header">
            <h3>Sessions</h3>
            <span className="badge">{sessions.length}</span>
          </div>
          {sessions.length === 0 ? (
            <p>No sessions yet. Create one to verify the PTY and snapshot pipeline.</p>
          ) : (
            <div className="session-list">
              {sessions.map((session) => (
                <button
                  key={session.sessionId}
                  className={`session-card ${
                    session.sessionId === selectedSessionId ? "session-card-active" : ""
                  }`}
                  onClick={() => void handleSelectSession(session.sessionId)}
                  disabled={busy}
                >
                  <span className={`session-state session-state-${session.status}`}>
                    {session.status}
                  </span>
                  <strong>{session.title}</strong>
                  <span>
                    {session.size.cols}x{session.size.rows}
                  </span>
                  <span>{session.transport}</span>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="panel panel-wide">
          <div className="panel-header">
            <h3>Snapshot</h3>
            {snapshot ? (
              <span className="badge">
                {snapshot.cursor.row},{snapshot.cursor.col}
              </span>
            ) : null}
          </div>
          {snapshot ? (
            <>
              <p className="meta">
                {snapshot.metadata.title} | {snapshot.metadata.status} | scrollback{" "}
                {snapshot.scrollback.lineCount}
              </p>
              <pre className="terminal-preview">
                {snapshot.visibleLines.join("\n") || " "}
              </pre>
            </>
          ) : (
            <p>Select a session to inspect its current screen snapshot.</p>
          )}
        </article>

        <article className="panel">
          <h3>Contract Surface</h3>
          <p>Desktop is now reading the daemon-backed Phase 1 contracts shared via <code>@aria/types</code>.</p>
          <div className="chips">
            {HEALTH_STATUSES.map((status) => (
              <span key={status} className="chip">
                {status}
              </span>
            ))}
            {SESSION_STATUSES.map((status) => (
              <span key={status} className="chip">
                {status}
              </span>
            ))}
          </div>
          {transportError ? (
            <p className="warning">Daemon bridge error: {transportError}</p>
          ) : null}
        </article>
      </section>
    </main>
  );
}
