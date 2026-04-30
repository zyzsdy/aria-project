import type { ProjectSummary, ProjectWorkspace, SessionSummary } from "@aria/types";
import { useState } from "react";
import { defineMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/react";

const PROJECT_SIDEBAR_MESSAGES = defineMessages({
  emptySession: {
    key: "workbench.projects.empty_session",
    defaultMessage: "No active session"
  },
  unavailable: {
    key: "workbench.projects.session_unavailable",
    defaultMessage: "Session unavailable"
  },
  cwd: {
    key: "workbench.projects.cwd_placeholder",
    defaultMessage: "cwd pending shell integration"
  },
  branch: {
    key: "workbench.projects.branch_placeholder",
    defaultMessage: "branch pending shell integration"
  },
  rename: {
    key: "workbench.projects.rename",
    defaultMessage: "Rename"
  },
  delete: {
    key: "workbench.projects.delete",
    defaultMessage: "Delete"
  },
});

type ProjectSidebarProps = {
  workspace: ProjectWorkspace;
  sessions: SessionSummary[];
  onSelectProject: (projectId: string) => void;
  onRenameProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
};

export function ProjectSidebar({
  workspace,
  sessions,
  onSelectProject,
  onRenameProject,
  onDeleteProject
}: ProjectSidebarProps) {
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);

  return (
    <div className="project-list">
      {workspace.projects.map((project) => (
        <ProjectRow
          key={project.projectId}
          isActive={project.projectId === workspace.activeProjectId}
          onSelectProject={onSelectProject}
          onRenameProject={onRenameProject}
          onDeleteProject={onDeleteProject}
          menuProjectId={menuProjectId}
          onMenuProjectIdChange={setMenuProjectId}
          project={project}
          sessions={sessions}
        />
      ))}
    </div>
  );
}

type ProjectRowProps = {
  isActive: boolean;
  project: ProjectSummary;
  sessions: SessionSummary[];
  onSelectProject: (projectId: string) => void;
  onRenameProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  menuProjectId: string | null;
  onMenuProjectIdChange: (projectId: string | null) => void;
};

function ProjectRow({
  isActive,
  project,
  sessions,
  onSelectProject,
  onRenameProject,
  onDeleteProject,
  menuProjectId,
  onMenuProjectIdChange
}: ProjectRowProps) {
  const t = useT();
  const activeTab = findActiveTab(project);
  const activeSession = activeTab?.sessionId
    ? sessions.find((session) => session.sessionId === activeTab.sessionId)
    : null;
  const sessionTitle = activeSession?.title ?? activeTab?.title ?? t(PROJECT_SIDEBAR_MESSAGES.emptySession);
  const isUnavailable = Boolean(activeTab?.sessionId && !activeSession);

  return (
    <div className="project-row-shell">
      <button
        className={`project-row ${isActive ? "project-row-active" : ""}`}
        onClick={() => onSelectProject(project.projectId)}
        onContextMenu={(event) => {
          event.preventDefault();
          onMenuProjectIdChange(project.projectId);
        }}
        type="button"
      >
        <span className="project-row-name">{project.name}</span>
        <span className={`project-row-session ${isUnavailable ? "project-row-session-unavailable" : ""}`}>
          {isUnavailable ? t(PROJECT_SIDEBAR_MESSAGES.unavailable) : sessionTitle}
        </span>
        <span className="project-row-meta">{t(PROJECT_SIDEBAR_MESSAGES.cwd)}</span>
        <span className="project-row-meta">{t(PROJECT_SIDEBAR_MESSAGES.branch)}</span>
      </button>
      {menuProjectId === project.projectId ? (
        <div className="app-menu project-menu" role="menu">
          <button
            className="app-menu-item"
            onClick={() => {
              onMenuProjectIdChange(null);
              onRenameProject(project.projectId);
            }}
            role="menuitem"
            type="button"
          >
            {t(PROJECT_SIDEBAR_MESSAGES.rename)}
          </button>
          <button
            className="app-menu-item"
            onClick={() => {
              onMenuProjectIdChange(null);
              onDeleteProject(project.projectId);
            }}
            role="menuitem"
            type="button"
          >
            {t(PROJECT_SIDEBAR_MESSAGES.delete)}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function findActiveTab(project: ProjectSummary) {
  const pane = findPane(project.layout, project.activePaneId);
  return pane?.tabs.find((tab) => tab.tabId === pane.activeTabId) ?? pane?.tabs[0] ?? null;
}

function findPane(node: ProjectSummary["layout"], paneId: string): Extract<ProjectSummary["layout"], { type: "leaf" }> | null {
  if (node.type === "leaf") {
    return node.paneId === paneId ? node : null;
  }

  return findPane(node.first, paneId) ?? findPane(node.second, paneId);
}
