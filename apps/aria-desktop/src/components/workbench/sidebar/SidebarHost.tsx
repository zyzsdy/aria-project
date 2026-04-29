import type { SessionSummary, ShellProfile } from "@aria/types";
import { ChevronDown, Plus, RefreshCw } from "lucide-react";
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
  openShellProfiles: {
    key: "workbench.sidebar.open_shell_profiles",
    defaultMessage: "Open shell profiles"
  },
  sessionsTitle: {
    key: "workbench.sidebar.sessions.title",
    defaultMessage: "Sessions"
  },
  collectionsTitle: {
    key: "workbench.sidebar.collections.title",
    defaultMessage: "Collections"
  },
  defaultProfile: {
    key: "workbench.sidebar.default_profile_badge",
    defaultMessage: "Default"
  }
});

type SidebarHostProps = {
  busy: boolean;
  onCreateSession: () => void;
  onCreateSessionWithProfile: (profileId: string) => void;
  onProfileMenuOpenChange: (next: boolean) => void;
  onRefresh: () => void;
  onSelectSession: (sessionId: string) => void;
  openSidebar: SidebarPanel;
  openProfileMenu: boolean;
  profiles: readonly ShellProfile[];
  defaultProfileId: string;
  selectedSessionId: string | null;
  sessions: SessionSummary[];
};

export function SidebarHost({
  busy,
  onCreateSession,
  onCreateSessionWithProfile,
  onProfileMenuOpenChange,
  onRefresh,
  onSelectSession,
  openSidebar,
  openProfileMenu,
  profiles,
  defaultProfileId,
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
            <div className="sidebar-split-button">
              <button
                aria-label={t(SIDEBAR_MESSAGES.createSession)}
                className="sidebar-split-button-segment sidebar-split-button-primary"
                disabled={busy}
                onClick={onCreateSession}
                type="button"
              >
                <Plus aria-hidden="true" size={14} strokeWidth={2} />
              </button>
              <button
                aria-label={t(SIDEBAR_MESSAGES.openShellProfiles)}
                className="sidebar-split-button-segment sidebar-split-button-toggle"
                disabled={busy}
                onClick={() => onProfileMenuOpenChange(!openProfileMenu)}
                type="button"
              >
                <ChevronDown aria-hidden="true" size={13} strokeWidth={2} />
              </button>
              {openProfileMenu ? (
                <div className="app-menu sidebar-menu" role="menu">
                  {profiles.map((profile) => (
                    <button
                      key={profile.id}
                      className="app-menu-item sidebar-menu-item"
                      onClick={() => onCreateSessionWithProfile(profile.id)}
                      role="menuitem"
                      type="button"
                    >
                      <span>{profile.name}</span>
                      {profile.id === defaultProfileId ? (
                        <span className="sidebar-menu-badge">
                          {t(SIDEBAR_MESSAGES.defaultProfile)}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
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
