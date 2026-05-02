import type { SessionStatus, SessionSummary } from "@aria/types";
import { useEffect, useState, type CSSProperties } from "react";
import { defineMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/react";

const SESSION_SIDEBAR_MESSAGES = defineMessages({
  empty: {
    key: "workbench.sidebar.sessions.empty",
    defaultMessage: "No sessions yet."
  },
  rename: {
    key: "workbench.sidebar.sessions.rename",
    defaultMessage: "Rename"
  },
  setBackground: {
    key: "workbench.sidebar.sessions.set_background",
    defaultMessage: "Run in background"
  },
  setForeground: {
    key: "workbench.sidebar.sessions.set_foreground",
    defaultMessage: "Bring to foreground"
  },
  terminate: {
    key: "workbench.sidebar.sessions.terminate",
    defaultMessage: "Terminate"
  }
});

type SessionSidebarProps = {
  selectedSessionId: string | null;
  sessions: SessionSummary[];
  onSelectSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string) => void;
  onSetSessionBackground: (sessionId: string, background: boolean) => void;
  onCloseSession: (sessionId: string) => void;
};

export function SessionSidebar({
  selectedSessionId,
  sessions,
  onSelectSession,
  onRenameSession,
  onSetSessionBackground,
  onCloseSession
}: SessionSidebarProps) {
  const t = useT();
  const [contextMenuState, setContextMenuState] = useState<{
    sessionId: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!contextMenuState) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".session-context-menu")) {
        return;
      }

      setContextMenuState(null);
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setContextMenuState(null);
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [contextMenuState]);

  if (sessions.length === 0) {
    return <p className="sidebar-empty-copy">{t(SESSION_SIDEBAR_MESSAGES.empty)}</p>;
  }

  const contextSession = contextMenuState
    ? sessions.find((session) => session.sessionId === contextMenuState.sessionId)
    : null;
  const canToggleBackground = contextSession
    ? isBackgroundToggleable(contextSession.status)
    : false;
  const nextBackground = contextSession?.status !== "background";

  return (
    <div className="session-list">
      {sessions.map((session) => (
        <button
          key={session.sessionId}
          className={`sidebar-tree-row ${session.sessionId === selectedSessionId ? "sidebar-tree-row-active" : ""}`}
          onClick={() => onSelectSession(session.sessionId)}
          onContextMenu={(event) => {
            event.preventDefault();
            setContextMenuState({
              sessionId: session.sessionId,
              x: event.clientX,
              y: event.clientY
            });
          }}
          type="button"
        >
          <span className={`sidebar-status-dot session-dot-${session.status}`} />
          <span className="sidebar-tree-label">{session.title}</span>
        </button>
      ))}
      {contextMenuState ? (
        <div
          className="app-menu session-context-menu"
          role="menu"
          style={
            {
              left: `${contextMenuState.x}px`,
              top: `${contextMenuState.y}px`
            } as CSSProperties
          }
        >
          <button
            className="app-menu-item"
            onClick={() => {
              onRenameSession(contextMenuState.sessionId);
              setContextMenuState(null);
            }}
            role="menuitem"
            type="button"
          >
            <span>{t(SESSION_SIDEBAR_MESSAGES.rename)}</span>
          </button>
          <button
            className="app-menu-item"
            disabled={!canToggleBackground}
            onClick={() => {
              if (!canToggleBackground) {
                return;
              }
              onSetSessionBackground(contextMenuState.sessionId, nextBackground);
              setContextMenuState(null);
            }}
            role="menuitem"
            type="button"
          >
            <span>
              {t(
                nextBackground
                  ? SESSION_SIDEBAR_MESSAGES.setBackground
                  : SESSION_SIDEBAR_MESSAGES.setForeground
              )}
            </span>
          </button>
          <button
            className="app-menu-item"
            onClick={() => {
              onCloseSession(contextMenuState.sessionId);
              setContextMenuState(null);
            }}
            role="menuitem"
            type="button"
          >
            <span>{t(SESSION_SIDEBAR_MESSAGES.terminate)}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function isBackgroundToggleable(status: SessionStatus) {
  return status === "running" || status === "background";
}
