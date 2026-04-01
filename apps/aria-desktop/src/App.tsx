import { invoke } from "@tauri-apps/api/core";
import type { HealthResponse } from "@aria/types";
import { HEALTH_STATUSES } from "@aria/types";
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
  message: "desktop shell running without an active Tauri bridge"
};

export function App() {
  const [health, setHealth] = useState<HealthResponse>(FALLBACK_HEALTH);
  const [transportError, setTransportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const next = await invoke<HealthResponse>("health");
        if (!cancelled) {
          setHealth(next);
        }
      } catch (error) {
        if (!cancelled) {
          setTransportError(error instanceof Error ? error.message : String(error));
        }
      }
    }

    loadHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Phase 0 Desktop Shell</p>
          <h1>Aria Terminal</h1>
          <p className="lede">
            The workspace skeleton is ready. PTY, SSH, layout orchestration, and
            plugin hosting will layer on top of this desktop shell in later phases.
          </p>
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
              <dt>Build time</dt>
              <dd>{health.app.buildTime ?? "not embedded"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h3>Current capabilities</h3>
          <ul>
            <li>Rust workspace with desktop, daemon, and CLI entrypoints</li>
            <li>Shared model and health-contract DTOs</li>
            <li>Unified bootstrap for config paths and observability</li>
            <li>React + Vite Tauri shell with a local invoke bridge</li>
          </ul>
        </article>

        <article className="panel">
          <h3>Reserved for Phase 1+</h3>
          <ul>
            <li>Session manager and local PTY transport</li>
            <li>Structured snapshots and AI-friendly APIs</li>
            <li>SSH connection management and secure vault integration</li>
            <li>Plugin runtime and extension surfaces</li>
          </ul>
        </article>

        <article className="panel">
          <h3>Health model</h3>
          <p>The frontend mirrors the shared health DTOs from <code>@aria/types</code>.</p>
          <div className="chips">
            {HEALTH_STATUSES.map((status) => (
              <span key={status} className="chip">
                {status}
              </span>
            ))}
          </div>
          {transportError ? (
            <p className="warning">Tauri invoke fallback: {transportError}</p>
          ) : null}
        </article>
      </section>
    </main>
  );
}
