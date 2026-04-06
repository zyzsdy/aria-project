import type { SessionSummary } from "@aria/types";
import { defineMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/react";

const SESSION_SIDEBAR_MESSAGES = defineMessages({
  empty: {
    key: "workbench.sidebar.sessions.empty",
    defaultMessage: "No sessions yet."
  }
});

type SessionSidebarProps = {
  selectedSessionId: string | null;
  sessions: SessionSummary[];
  onSelectSession: (sessionId: string) => void;
};

export function SessionSidebar({
  selectedSessionId,
  sessions,
  onSelectSession
}: SessionSidebarProps) {
  const t = useT();

  if (sessions.length === 0) {
    return <p className="sidebar-empty-copy">{t(SESSION_SIDEBAR_MESSAGES.empty)}</p>;
  }

  return (
    <div className="session-list">
      {sessions.map((session) => (
        <button
          key={session.sessionId}
          className={`sidebar-tree-row ${session.sessionId === selectedSessionId ? "sidebar-tree-row-active" : ""}`}
          onClick={() => onSelectSession(session.sessionId)}
          type="button"
        >
          <span className={`sidebar-status-dot session-dot-${session.status}`} />
          <span className="sidebar-tree-label">{session.title}</span>
        </button>
      ))}
    </div>
  );
}
