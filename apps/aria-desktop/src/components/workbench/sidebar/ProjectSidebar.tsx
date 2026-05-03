import type { ProjectSummary, ProjectWorkspace, SessionSummary } from "@aria/types";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { defineMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/react";

const POINTER_DRAG_THRESHOLD_PX = 4;

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

type ProjectDragPreview = {
  draggingProjectId: string | null;
  dropProjectId: string | null;
  dropPlacement: "before" | "after" | null;
};

type ProjectSidebarProps = {
  workspace: ProjectWorkspace;
  sessions: SessionSummary[];
  onSelectProject: (projectId: string) => void;
  onRenameProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onReorderProjects?: (projectIds: string[]) => void;
};

export function ProjectSidebar({
  workspace,
  sessions,
  onSelectProject,
  onRenameProject,
  onDeleteProject,
  onReorderProjects
}: ProjectSidebarProps) {
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<ProjectDragPreview>({
    draggingProjectId: null,
    dropProjectId: null,
    dropPlacement: null
  });
  const pointerDragRef = useRef<{
    pointerId: number;
    projectId: string;
    startX: number;
    startY: number;
    isDragging: boolean;
    cleanup: () => void;
  } | null>(null);
  const suppressNextClickRef = useRef<string | null>(null);

  function getPointerDropTarget(clientX: number, clientY: number): {
    projectId: string;
    placement: "before" | "after";
  } | null {
    const hitElement = document.elementFromPoint(clientX, clientY);
    if (!(hitElement instanceof Element)) {
      return null;
    }

    const rowShell = hitElement.closest<HTMLElement>("[data-project-id]");
    if (!rowShell) {
      return null;
    }

    const projectId = rowShell.dataset.projectId;
    if (!projectId) {
      return null;
    }

    const rect = rowShell.getBoundingClientRect();
    const placement = clientY < rect.top + rect.height / 2 ? "before" : "after";
    return { projectId, placement };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>, projectId: string) {
    if (!onReorderProjects || event.button !== 0) {
      return;
    }

    const drag = {
      pointerId: event.pointerId,
      projectId,
      startX: event.clientX,
      startY: event.clientY,
      isDragging: false,
      cleanup: () => undefined as void
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== drag.pointerId) {
        return;
      }

      const deltaX = moveEvent.clientX - drag.startX;
      const deltaY = moveEvent.clientY - drag.startY;
      if (!drag.isDragging && Math.hypot(deltaX, deltaY) < POINTER_DRAG_THRESHOLD_PX) {
        return;
      }

      moveEvent.preventDefault();
      drag.isDragging = true;
      const dropTarget = getPointerDropTarget(moveEvent.clientX, moveEvent.clientY);
      setDragPreview({
        draggingProjectId: projectId,
        dropProjectId: dropTarget?.projectId ?? null,
        dropPlacement: dropTarget?.placement ?? null
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== drag.pointerId) {
        return;
      }

      if (drag.isDragging) {
        const dropTarget = getPointerDropTarget(upEvent.clientX, upEvent.clientY);
        if (dropTarget && dropTarget.projectId !== projectId) {
          upEvent.preventDefault();
          suppressNextClickRef.current = projectId;
          const projectIds = workspace.projects.map((p) => p.projectId);
          const fromIndex = projectIds.indexOf(projectId);
          let toIndex = projectIds.indexOf(dropTarget.projectId);
          if (fromIndex === -1 || toIndex === -1) {
            drag.cleanup();
            pointerDragRef.current = null;
            setDragPreview({ draggingProjectId: null, dropProjectId: null, dropPlacement: null });
            return;
          }

          // Remove from old position
          projectIds.splice(fromIndex, 1);
          // Recalculate target index after removal
          toIndex = projectIds.indexOf(dropTarget.projectId);
          const insertIndex = dropTarget.placement === "after" ? toIndex + 1 : toIndex;
          projectIds.splice(insertIndex, 0, projectId);
          onReorderProjects(projectIds);
        }
      }

      drag.cleanup();
      pointerDragRef.current = null;
      setDragPreview({ draggingProjectId: null, dropProjectId: null, dropPlacement: null });
    };

    const handlePointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== drag.pointerId) {
        return;
      }

      drag.cleanup();
      pointerDragRef.current = null;
      setDragPreview({ draggingProjectId: null, dropProjectId: null, dropPlacement: null });
    };

    drag.cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
    pointerDragRef.current = drag;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    setMenuProjectId(null);
  }

  function handleSelectProject(projectId: string) {
    if (suppressNextClickRef.current === projectId) {
      suppressNextClickRef.current = null;
      return;
    }

    onSelectProject(projectId);
  }

  return (
    <div className="project-list">
      {workspace.projects.map((project) => (
        <ProjectRow
          key={project.projectId}
          dragPreview={dragPreview}
          isActive={project.projectId === workspace.activeProjectId}
          onSelectProject={handleSelectProject}
          onPointerDown={onReorderProjects ? handlePointerDown : undefined}
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
  dragPreview: ProjectDragPreview;
  isActive: boolean;
  project: ProjectSummary;
  sessions: SessionSummary[];
  onSelectProject: (projectId: string) => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>, projectId: string) => void;
  onRenameProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  menuProjectId: string | null;
  onMenuProjectIdChange: (projectId: string | null) => void;
};

function ProjectRow({
  dragPreview,
  isActive,
  project,
  sessions,
  onSelectProject,
  onPointerDown,
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

  const isDragging = dragPreview.draggingProjectId === project.projectId;
  const isDropBefore = dragPreview.dropProjectId === project.projectId && dragPreview.dropPlacement === "before";
  const isDropAfter = dragPreview.dropProjectId === project.projectId && dragPreview.dropPlacement === "after";

  return (
    <div
      className={[
        "project-row-shell",
        isDragging ? "project-row-dragging" : "",
        isDropBefore ? "project-row-drop-before" : "",
        isDropAfter ? "project-row-drop-after" : ""
      ]
        .filter(Boolean)
        .join(" ")}
      data-project-id={project.projectId}
      onPointerDown={(event) => onPointerDown?.(event, project.projectId)}
    >
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
