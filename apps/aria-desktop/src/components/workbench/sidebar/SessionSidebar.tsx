import type { SessionSummary } from "@aria/types";

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
  if (sessions.length === 0) {
    return <p className="sidebar-empty-copy">No sessions yet.</p>;
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
