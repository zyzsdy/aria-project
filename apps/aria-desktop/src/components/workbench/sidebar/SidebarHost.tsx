import type { SessionSummary } from "@aria/types";
import { Plus, RefreshCw } from "lucide-react";
import { defineMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/react";
import { CollectionsSidebar } from "./CollectionsSidebar";
import { SessionSidebar } from "./SessionSidebar";
import type { SidebarPanel } from "./sidebarState";

const SIDEBAR_MESSAGES = defineMessages({
  panelAriaLabel: {
    key: "workbench.sidebar.panel_aria_label",
    defaultMessage: "{panel} panel"
  },
  refreshSessions: {
    key: "workbench.sidebar.refresh_sessions",
    defaultMessage: "Refresh sessions"
  },
  createSession: {
    key: "workbench.sidebar.create_session",
    defaultMessage: "Create session"
  },
  sessionsTitle: {
    key: "workbench.sidebar.sessions.title",
    defaultMessage: "Sessions"
  },
  collectionsTitle: {
    key: "workbench.sidebar.collections.title",
    defaultMessage: "Collections"
  }
});

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
  const t = useT();
  const isSessions = openSidebar === "sessions";
  const title = isSessions
    ? t(SIDEBAR_MESSAGES.sessionsTitle)
    : t(SIDEBAR_MESSAGES.collectionsTitle);

  return (
    <aside
      className="sidebar-panel"
      aria-label={t(SIDEBAR_MESSAGES.panelAriaLabel, { panel: title })}
    >
      <header className="sidebar-panel-header">
        <h2>{title}</h2>
        {isSessions ? (
          <div className="sidebar-panel-actions">
            <button
              aria-label={t(SIDEBAR_MESSAGES.refreshSessions)}
              className="sidebar-icon-button"
              disabled={busy}
              onClick={onRefresh}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={14} strokeWidth={2} />
            </button>
            <button
              aria-label={t(SIDEBAR_MESSAGES.createSession)}
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
