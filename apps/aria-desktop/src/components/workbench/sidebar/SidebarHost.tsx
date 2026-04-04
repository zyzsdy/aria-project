import type { SessionSummary } from "@aria/types";
import { Plus, RefreshCw } from "lucide-react";
import { CollectionsSidebar } from "./CollectionsSidebar";
import { SessionSidebar } from "./SessionSidebar";
import type { SidebarPanel } from "./sidebarState";

type SidebarHostProps = {
  busy: boolean;
  onCreateSession: () => void;
  onRefresh: () => void;
  onSelectSession: (sessionId: string) => void;
  openSidebar: SidebarPanel;
  selectedSessionId: string | null;
  sessions: SessionSummary[];
};

export function SidebarHost({
  busy,
  onCreateSession,
  onRefresh,
  onSelectSession,
  openSidebar,
  selectedSessionId,
  sessions
}: SidebarHostProps) {
  const isSessions = openSidebar === "sessions";

  return (
    <aside className="sidebar-panel" aria-label={`${isSessions ? "Sessions" : "Collections"} panel`}>
      <header className="sidebar-panel-header">
        <h2>{isSessions ? "Sessions" : "Collections"}</h2>
        {isSessions ? (
          <div className="sidebar-panel-actions">
            <button
              aria-label="Refresh sessions"
              className="sidebar-icon-button"
              disabled={busy}
              onClick={onRefresh}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={14} strokeWidth={2} />
            </button>
            <button
              aria-label="Create session"
              className="sidebar-icon-button"
              disabled={busy}
              onClick={onCreateSession}
              type="button"
            >
              <Plus aria-hidden="true" size={14} strokeWidth={2} />
            </button>
          </div>
        ) : null}
      </header>

      <div className="sidebar-panel-body">
        {isSessions ? (
          <SessionSidebar
            onSelectSession={onSelectSession}
            selectedSessionId={selectedSessionId}
            sessions={sessions}
          />
        ) : (
          <CollectionsSidebar />
        )}
      </div>
    </aside>
  );
}
