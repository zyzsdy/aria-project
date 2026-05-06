import { invoke } from "@tauri-apps/api/core";
import {
  type AppSettings,
  type CreateProjectWindowFromTabResponse,
  type CreateLocalSessionResponse,
  type PaneSplitDirection,
  type ProjectPaneNode,
  type ProjectSummary,
  type ProjectTab,
  type ProjectWindow,
  type ProjectWindowGeometry,
  type ProjectWorkspace,
  type SessionMetadataDelta,
  type SessionStatus,
  type SessionStreamMetadata,
  type SessionSummary,
  type SettingsGroup,
  type UpdateAppSettingsPayload,
  type ReorderProjectsRequest
} from "@aria/types";
import { startTransition, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ModalDialog } from "./components/ModalDialog";
import { AboutDialog } from "./components/workbench/AboutDialog";
import { ActivityRail } from "./components/workbench/ActivityRail";
import { TitleBar } from "./components/workbench/TitleBar";
import { WorkbenchMain } from "./components/workbench/main/WorkbenchMain";
import { getHtmlPageTitle } from "./components/workbench/main/htmlPageTitles";
import {
  addSessionTabToActivePane,
  closeProjectTab,
  createEmptyProjectWorkspace,
  getActiveProject,
  moveProjectTab,
  openHtmlTabInActiveProject,
  selectProject,
  selectProjectTab,
  splitPane
} from "./components/workbench/main/projectLayoutState";
import { RenameSessionDialog } from "./components/workbench/sidebar/RenameSessionDialog";
import { ProjectNameDialog } from "./components/workbench/sidebar/ProjectNameDialog";
import { SidebarHost } from "./components/workbench/sidebar/SidebarHost";
import type { SidebarPanel } from "./components/workbench/sidebar/sidebarState";
import { UtilityPanelHost } from "./components/workbench/utility/UtilityPanelHost";
import { BUNDLED_CATALOG_SOURCE } from "./i18n/bundledCatalogSource";
import { defineMessages } from "./i18n/messages";
import { DESKTOP_I18N_NAMESPACES } from "./i18n/namespaces";
import { I18nProvider, useT } from "./i18n/react";
import { DEFAULT_APP_SETTINGS, cloneSettings, resolveThemeMode } from "./settings/appSettings";
import { createSettingsStore } from "./settings/settingsStore";

type ToolNotice = "check_updates_unavailable" | null;
type ProjectNameDialogState =
  | { mode: "create" }
  | { mode: "rename"; projectId: string; currentName: string }
  | null;

const APP_MESSAGES = defineMessages({
  checkUpdatesUnavailable: {
    key: "workbench.status.check_updates_unavailable",
    defaultMessage: "Check for Updates is not wired up yet."
  },
  dismiss: {
    key: "common.actions.dismiss",
    defaultMessage: "Dismiss"
  },
  close: {
    key: "common.actions.close",
    defaultMessage: "Close"
  },
  sessionLaunchErrorTitle: {
    key: "dialogs.session_launch_error.title",
    defaultMessage: "Unable to create session"
  },
  sessionLaunchErrorCopy: {
    key: "dialogs.session_launch_error.copy",
    defaultMessage:
      "Aria could not start the selected shell profile. Review the command, arguments, or startup directory and try again."
  },
  sessionLaunchErrorDetailsLabel: {
    key: "dialogs.session_launch_error.details_label",
    defaultMessage: "Error details"
  }
});

const CATALOG_SOURCES = [BUNDLED_CATALOG_SOURCE] as const;
const PROJECT_WINDOW_LABEL_PREFIX = "project-window-";
const PROJECT_WORKSPACE_UPDATED_EVENT = "project-workspace-updated";
const EXTRA_WINDOW_DEFAULT_WIDTH = 900;
const EXTRA_WINDOW_DEFAULT_HEIGHT = 620;

export function App() {
  const currentProjectWindowId = getCurrentProjectWindowId();
  const isProjectWindow = currentProjectWindowId !== null;
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [projectWorkspace, setProjectWorkspace] = useState<ProjectWorkspace>(
    createEmptyProjectWorkspace
  );
  const [settings, setSettings] = useState<AppSettings>(cloneSettings(DEFAULT_APP_SETTINGS));
  const [selectedSettingsGroup, setSelectedSettingsGroup] =
    useState<SettingsGroup>("appearance");
  const [busy, setBusy] = useState(false);
  const [openSidebar, setOpenSidebar] = useState<SidebarPanel | null>("projects");
  const [isToolMenuOpen, setIsToolMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [toolNotice, setToolNotice] = useState<ToolNotice>(null);
  const [sessionLaunchError, setSessionLaunchError] = useState<string | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [projectNameDialog, setProjectNameDialog] = useState<ProjectNameDialogState>(null);

  const projectWorkspaceRef = useRef<ProjectWorkspace>(createEmptyProjectWorkspace());
  const closingTerminalTabIdsRef = useRef<Set<string>>(new Set());
  const settingsRef = useRef<AppSettings>(cloneSettings(DEFAULT_APP_SETTINGS));
  const settingsStoreRef = useRef(
    createSettingsStore({
      get: () => invoke<AppSettings>("get_app_settings"),
      update: (payload) => invoke<AppSettings>("update_app_settings", { settings: payload }),
      resetGroup: (group) => invoke<AppSettings>("reset_app_settings_group", { group })
    })
  );

  const selectedSessionId = getSelectedSessionId(projectWorkspace, sessions);
  const systemLocale = getSystemLocale();

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    projectWorkspaceRef.current = projectWorkspace;
  }, [projectWorkspace]);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unsubscribe: (() => void) | null = null;
    let disposed = false;

    void appWindow
      .listen<ProjectWorkspace>(PROJECT_WORKSPACE_UPDATED_EVENT, (event) => {
        if (disposed) {
          return;
        }
        projectWorkspaceRef.current = event.payload;
        startTransition(() => {
          setProjectWorkspace(event.payload);
        });
        if (isProjectWindow && !findProjectWindow(event.payload, currentProjectWindowId)) {
          void closeCurrentTauriWindow();
        }
      })
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        unsubscribe = unlisten;
      })
      .catch(logDesktopError);

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [currentProjectWindowId, isProjectWindow]);

  useEffect(() => {
    if (isProjectWindow) {
      return;
    }

    void reconcileProjectWindows(projectWorkspace);
  }, [isProjectWindow, projectWorkspace]);

  useEffect(() => {
    if (!isProjectWindow) {
      return;
    }

    const appWindow = getCurrentWindow();
    let saveTimer: ReturnType<typeof window.setTimeout> | null = null;
    const scheduleSaveGeometry = () => {
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer);
      }
      saveTimer = window.setTimeout(() => {
        void persistCurrentProjectWindowGeometry(currentProjectWindowId);
      }, 250);
    };

    const moved = appWindow.onMoved(scheduleSaveGeometry);
    const resized = appWindow.onResized(scheduleSaveGeometry);
    return () => {
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer);
      }
      void moved.then((unlisten) => unlisten());
      void resized.then((unlisten) => unlisten());
    };
  }, [currentProjectWindowId, isProjectWindow]);

  useEffect(() => {
    if (openSidebar !== "sessions") {
      setIsProfileMenuOpen(false);
    }
  }, [openSidebar]);

  useEffect(() => {
    const settingsStore = settingsStoreRef.current;
    const unsubscribe = settingsStore.subscribe((nextSettings) => {
      startTransition(() => {
        setSettings(cloneSettings(nextSettings));
      });
    });

    void (async () => {
      try {
        await settingsStore.load();
        await refreshWorkbench({
          startupBehavior: settingsStore.getSnapshot().workspace.startupBehavior
        });
      } catch (error) {
        logDesktopError(error);
      }
    })();

    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (
        settings.workspace.closeConfirmation !== "confirm_running_sessions" ||
        !sessions.some((session) => isLiveSessionStatus(session.status))
      ) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [sessions, settings.workspace.closeConfirmation]);

  async function refreshWorkbench(options?: {
    ensureSession?: Pick<SessionSummary, "sessionId" | "title">;
    startupBehavior?: AppSettings["workspace"]["startupBehavior"];
  }) {
    setBusy(true);

    try {
      const [nextSessions, loadedWorkspace] = await Promise.all([
        invoke<SessionSummary[]>("list_sessions"),
        invoke<ProjectWorkspace>("get_project_workspace")
      ]);
      const startupSession =
        !options?.ensureSession &&
        projectWorkspaceHasNoTabs(projectWorkspaceRef.current) &&
        (options?.startupBehavior ?? settingsRef.current.workspace.startupBehavior) ===
          "restore_previous" &&
        nextSessions[0]
          ? nextSessions[0]
          : undefined;
      const sessionToEnsure = options?.ensureSession ?? startupSession;
      const nextWorkspace = sessionToEnsure
        ? addSessionTabToActivePane(loadedWorkspace, sessionToEnsure)
        : loadedWorkspace;

      startTransition(() => {
        setSessions(nextSessions);
        setProjectWorkspace(nextWorkspace);
      });
      projectWorkspaceRef.current = nextWorkspace;
      if (sessionToEnsure) {
        await persistProjectWindowLayout(nextWorkspace, null);
      }
      await broadcastProjectWorkspace(nextWorkspace);
    } catch (error) {
      logDesktopError(error);
    } finally {
      setBusy(false);
    }
  }

  async function applyProjectWorkspace(
    nextWorkspace: ProjectWorkspace,
    persist = true,
    closeSessionIfUnused?: string | null,
    projectWindowId: string | null = currentProjectWindowId
  ) {
    projectWorkspaceRef.current = nextWorkspace;
    setProjectWorkspace(nextWorkspace);
    if (persist) {
      await persistProjectWindowLayout(nextWorkspace, projectWindowId, { closeSessionIfUnused });
    }
    await broadcastProjectWorkspace(nextWorkspace);
  }

  async function handleCloseSession(sessionId: string) {
    startTransition(() => {
      setSessions((current) => current.filter((s) => s.sessionId !== sessionId));
    });
    try {
      await invoke("close_session", { sessionId });
    } catch (error) {
      logDesktopError(error);
    }
    await refreshWorkbench({ startupBehavior: "open_empty" });
  }

  async function handleSelectSession(sessionId: string) {
    const session = sessions.find((candidate) => candidate.sessionId === sessionId);
    if (!session) {
      return;
    }
    await applyProjectWorkspace(
      transformProjectWindowLayout(projectWorkspaceRef.current, currentProjectWindowId, (workspace) =>
        addSessionTabToActivePane(workspace, session)
      )
    );
  }

  async function handleSelectProject(projectId: string) {
    const nextWorkspace = selectProject(projectWorkspaceRef.current, projectId);
    projectWorkspaceRef.current = nextWorkspace;
    setProjectWorkspace(nextWorkspace);
    try {
      const updated = await invoke<ProjectWorkspace>("activate_project", { projectId });
      projectWorkspaceRef.current = updated;
      setProjectWorkspace(updated);
    } catch (error) {
      logDesktopError(error);
    }
  }

  async function handleReorderProjects(projectIds: string[]) {
    const currentProjects = projectWorkspaceRef.current.projects;
    const reordered = projectIds
      .map((id) => currentProjects.find((p) => p.projectId === id))
      .filter((p): p is ProjectSummary => p !== null);

    if (reordered.length !== currentProjects.length) {
      return;
    }

    const nextWorkspace: ProjectWorkspace = {
      ...projectWorkspaceRef.current,
      projects: reordered
    };
    projectWorkspaceRef.current = nextWorkspace;
    setProjectWorkspace(nextWorkspace);

    try {
      const request: ReorderProjectsRequest = { projectIds };
      const updated = await invoke<ProjectWorkspace>("reorder_projects", { request });
      projectWorkspaceRef.current = updated;
      setProjectWorkspace(updated);
    } catch (error) {
      logDesktopError(error);
    }
  }

  function handleCreateProject() {
    setProjectNameDialog({ mode: "create" });
  }

  async function handleCreateProjectConfirm(name: string) {
    try {
      await invoke<ProjectSummary>("create_project", { name });
      const nextWorkspace = await invoke<ProjectWorkspace>("get_project_workspace");
      projectWorkspaceRef.current = nextWorkspace;
      setProjectWorkspace(nextWorkspace);
      setOpenSidebar("projects");
      setProjectNameDialog(null);
    } catch (error) {
      logDesktopError(error);
    }
  }

  function handleRenameProject(projectId: string) {
    const project = projectWorkspaceRef.current.projects.find(
      (candidate) => candidate.projectId === projectId
    );
    if (!project) {
      return;
    }

    setProjectNameDialog({
      mode: "rename",
      projectId,
      currentName: project.name
    });
  }

  async function handleRenameProjectConfirm(projectId: string, name: string) {
    try {
      const nextWorkspace = await invoke<ProjectWorkspace>("rename_project", { projectId, name });
      projectWorkspaceRef.current = nextWorkspace;
      setProjectWorkspace(nextWorkspace);
      setProjectNameDialog(null);
    } catch (error) {
      logDesktopError(error);
    }
  }

  async function handleDeleteProject(projectId: string) {
    try {
      const nextWorkspace = await invoke<ProjectWorkspace>("delete_project", { projectId });
      projectWorkspaceRef.current = nextWorkspace;
      setProjectWorkspace(nextWorkspace);
      await broadcastProjectWorkspace(nextWorkspace);
    } catch (error) {
      logDesktopError(error);
    }
  }

  async function handleActivatePane(paneId: string) {
    const activeProject = getActiveProject(projectWorkspaceRef.current);
    const activeWindow = getProjectWindowView(activeProject, currentProjectWindowId);
    if (!activeProject || !activeWindow || activeWindow.activePaneId === paneId) {
      return;
    }
    const nextWorkspace = updateProjectWindowView(
      projectWorkspaceRef.current,
      activeProject.projectId,
      currentProjectWindowId,
      activeWindow.layout,
      paneId
    );
    await applyProjectWorkspace(nextWorkspace);
  }

  async function handleSelectProjectTab(paneId: string, tabId: string) {
    await applyProjectWorkspace(
      transformProjectWindowLayout(projectWorkspaceRef.current, currentProjectWindowId, (workspace) =>
        selectProjectTab(workspace, paneId, tabId)
      )
    );
  }

  async function handleCloseProjectTab(paneId: string, tabId: string) {
    const activeProject = getActiveProject(projectWorkspaceRef.current);
    const activeWindow = getProjectWindowView(activeProject, currentProjectWindowId);
    const closingTab = activeWindow ? findProjectTab(activeWindow.layout, paneId, tabId) : null;
    const closingSession = closingTab?.sessionId
      ? sessions.find((session) => session.sessionId === closingTab.sessionId)
      : null;
    const closeSessionIfUnused =
      closingTab?.kind === "terminal" && closingSession?.status !== "background"
        ? closingTab.sessionId ?? null
        : null;
    if (closeSessionIfUnused) {
      closingTerminalTabIdsRef.current.add(tabId);
    }
    await applyProjectWorkspace(
      transformProjectWindowLayout(projectWorkspaceRef.current, currentProjectWindowId, (workspace) =>
        closeProjectTab(workspace, paneId, tabId)
      ),
      true,
      closeSessionIfUnused
    );
  }

  async function handleDetachProjectTab(paneId: string, tabId: string, sessionId: string) {
    const success = await handleSetSessionBackground(sessionId, true);
    if (!success) {
      return;
    }

    await applyProjectWorkspace(
      transformProjectWindowLayout(projectWorkspaceRef.current, currentProjectWindowId, (workspace) =>
        closeProjectTab(workspace, paneId, tabId)
      ),
      true,
      null
    );
  }

  async function handleSplitPane(paneId: string, direction: PaneSplitDirection) {
    await applyProjectWorkspace(
      transformProjectWindowLayout(projectWorkspaceRef.current, currentProjectWindowId, (workspace) =>
        splitPane(workspace, paneId, direction)
      )
    );
  }

  async function handleMoveProjectTab(
    sourcePaneId: string,
    tabId: string,
    targetPaneId: string,
    targetIndex: number
  ) {
    await applyProjectWorkspace(
      transformProjectWindowLayout(projectWorkspaceRef.current, currentProjectWindowId, (workspace) =>
        moveProjectTab(workspace, sourcePaneId, tabId, targetPaneId, targetIndex)
      )
    );
  }

  async function handleProjectLayoutChange(layout: ProjectPaneNode, activePaneId: string) {
    const activeProject = getActiveProject(projectWorkspaceRef.current);
    if (!activeProject) {
      return;
    }
    const nextWorkspace = updateProjectWindowView(
      projectWorkspaceRef.current,
      activeProject.projectId,
      currentProjectWindowId,
      layout,
      activePaneId
    );
    await applyProjectWorkspace(nextWorkspace);
  }

  async function handleMoveProjectTabToNewWindow(
    sourcePaneId: string,
    tabId: string,
    releasePoint: { x: number; y: number }
  ) {
    const activeProject = getActiveProject(projectWorkspaceRef.current);
    if (!activeProject) {
      return;
    }

    try {
      const response = await invoke<CreateProjectWindowFromTabResponse>(
        "create_project_window_from_tab",
        {
          request: {
            projectId: activeProject.projectId,
            sourceWindowId: currentProjectWindowId,
            sourcePaneId,
            tabId,
            geometry: await createProjectWindowGeometry(releasePoint)
          }
        }
      );
      projectWorkspaceRef.current = response.workspace;
      setProjectWorkspace(response.workspace);
      await openProjectWindow(response.window);
      await broadcastProjectWorkspace(response.workspace);
    } catch (error) {
      logDesktopError(error);
    }
  }

  function handleRenameSession(sessionId: string) {
    setRenamingSessionId(sessionId);
  }

  async function handleSetSessionBackground(sessionId: string, background: boolean) {
    startTransition(() => {
      setSessions((current) =>
        current.map((session) =>
          session.sessionId === sessionId && isLiveSessionStatus(session.status)
            ? {
                ...session,
                status: background ? "background" : "running"
              }
            : session
        )
      );
    });
    try {
      await invoke("set_session_background", { sessionId, background });
      return true;
    } catch (error) {
      logDesktopError(error);
      await refreshWorkbench({ startupBehavior: "open_empty" });
      return false;
    }
  }

  async function handleRenameConfirm(newTitle: string) {
    const sessionId = renamingSessionId;
    if (!sessionId) {
      return;
    }
    try {
      await invoke("rename_session", { sessionId, title: newTitle });
    } catch (error) {
      logDesktopError(error);
    } finally {
      setRenamingSessionId(null);
    }
  }

  async function handleCreateSession(profileId?: string) {
    setBusy(true);
    setIsProfileMenuOpen(false);
    setSessionLaunchError(null);

    try {
      const created = await invoke<CreateLocalSessionResponse>("create_local_session", {
        cols: 120,
        rows: 32,
        profileId
      });
      const session = created.summary;
      startTransition(() => {
        setSessions((current) =>
          current.some((candidate) => candidate.sessionId === session.sessionId)
            ? current
            : [...current, session]
        );
      });
      await applyProjectWorkspace(
        transformProjectWindowLayout(
          projectWorkspaceRef.current,
          currentProjectWindowId,
          (workspace) => addSessionTabToActivePane(workspace, session)
        )
      );
    } catch (error) {
      setSessionLaunchError(describeDesktopError(error));
      logDesktopError(error);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateSettings(next: Partial<AppSettings>) {
    try {
      await settingsStoreRef.current.update(next as UpdateAppSettingsPayload);
    } catch (error) {
      logDesktopError(error);
    }
  }

  async function handleResetSettingsGroup(group: SettingsGroup) {
    try {
      await settingsStoreRef.current.resetGroup(group);
    } catch (error) {
      logDesktopError(error);
    }
  }

  async function handleOpenSettingsTab(title: string) {
    await applyProjectWorkspace(
      transformProjectWindowLayout(projectWorkspaceRef.current, currentProjectWindowId, (workspace) =>
        openHtmlTabInActiveProject(workspace, "settings", title)
      )
    );
  }

  async function handleCloseCurrentProjectWindow() {
    if (!currentProjectWindowId) {
      await closeCurrentTauriWindow();
      return;
    }

    const activeProject = getActiveProject(projectWorkspaceRef.current);
    if (!activeProject) {
      await closeCurrentTauriWindow();
      return;
    }

    try {
      const nextWorkspace = await invoke<ProjectWorkspace>("close_project_window", {
        request: {
          projectId: activeProject.projectId,
          windowId: currentProjectWindowId
        }
      });
      projectWorkspaceRef.current = nextWorkspace;
      setProjectWorkspace(nextWorkspace);
      await broadcastProjectWorkspace(nextWorkspace);
    } catch (error) {
      logDesktopError(error);
    } finally {
      await closeCurrentTauriWindow();
    }
  }

  async function persistCurrentProjectWindowGeometry(windowId: string) {
    const activeProject = getActiveProject(projectWorkspaceRef.current);
    if (!activeProject || !activeProject.extraWindows.some((window) => window.windowId === windowId)) {
      return;
    }

    try {
      const geometry = await readCurrentProjectWindowGeometry();
      const nextWorkspace = await invoke<ProjectWorkspace>("update_project_window_geometry", {
        request: {
          projectId: activeProject.projectId,
          windowId,
          geometry
        }
      });
      projectWorkspaceRef.current = nextWorkspace;
      setProjectWorkspace(nextWorkspace);
      await broadcastProjectWorkspace(nextWorkspace);
    } catch (error) {
      logDesktopError(error);
    }
  }

  return (
    <I18nProvider
      locale={settings.localization.locale}
      namespaces={DESKTOP_I18N_NAMESPACES}
      sources={CATALOG_SOURCES}
      systemLocale={systemLocale}
    >
      <AppShell
        currentProjectWindowId={currentProjectWindowId}
        busy={busy}
        isAboutDialogOpen={isAboutDialogOpen}
        isToolMenuOpen={isToolMenuOpen}
        onCheckForUpdates={() => setToolNotice("check_updates_unavailable")}
        onCloseAboutDialog={() => setIsAboutDialogOpen(false)}
        onCloseToolNotice={() => setToolNotice(null)}
        onActivatePane={(paneId) => void handleActivatePane(paneId)}
        onCloseProjectTab={(paneId, tabId) => void handleCloseProjectTab(paneId, tabId)}
        onDetachProjectTab={(paneId, tabId, sessionId) =>
          void handleDetachProjectTab(paneId, tabId, sessionId)
        }
        onMoveProjectTab={(sourcePaneId, tabId, targetPaneId, targetIndex) =>
          void handleMoveProjectTab(sourcePaneId, tabId, targetPaneId, targetIndex)
        }
        onMoveProjectTabToNewWindow={(sourcePaneId, tabId, releasePoint) =>
          void handleMoveProjectTabToNewWindow(sourcePaneId, tabId, releasePoint)
        }
        onCloseProjectWindow={() => void handleCloseCurrentProjectWindow()}
        onCloseSession={handleCloseSession}
        onCloseRenameDialog={() => setRenamingSessionId(null)}
        onCloseProjectNameDialog={() => setProjectNameDialog(null)}
        onConfirmProjectName={(name) => void handleProjectNameConfirm(name)}
        onCreateProject={handleCreateProject}
        onCreateSession={() => void handleCreateSession(settings.profiles.defaultProfileId)}
        onCreateSessionWithProfile={(profileId) => void handleCreateSession(profileId)}
        onDeleteProject={(projectId) => void handleDeleteProject(projectId)}
        onOpenAbout={() => setIsAboutDialogOpen(true)}
        onOpenSettingsTab={handleOpenSettingsTab}
        onOpenSidebarChange={setOpenSidebar}
        onProfileMenuOpenChange={setIsProfileMenuOpen}
        onRefresh={() => void refreshWorkbench()}
        onProjectLayoutChange={(layout, activePaneId) =>
          void handleProjectLayoutChange(layout, activePaneId)
        }
        onRenameProject={handleRenameProject}
        onReorderProjects={(projectIds) => void handleReorderProjects(projectIds)}
        onRenameSession={handleRenameSession}
        onSetSessionBackground={(sessionId, background) =>
          void handleSetSessionBackground(sessionId, background)
        }
        onRenameConfirm={handleRenameConfirm}
        onResetSettingsGroup={handleResetSettingsGroup}
        onSelectProject={(projectId) => void handleSelectProject(projectId)}
        onSelectProjectTab={(paneId, tabId) => void handleSelectProjectTab(paneId, tabId)}
        onSelectSession={handleSelectSession}
        onSelectSettingsGroup={setSelectedSettingsGroup}
        onSplitPane={(paneId, direction) => void handleSplitPane(paneId, direction)}
        onStreamDetached={handleStreamDetached}
        onStreamError={logDesktopError}
        onStreamMetadata={handleStreamMetadata}
        onStreamMetadataDelta={handleStreamMetadataDelta}
        shouldCloseSessionIfUnusedOnDispose={(tabId) =>
          closingTerminalTabIdsRef.current.delete(tabId)
        }
        defaultProfileId={settings.profiles.defaultProfileId}
        isProfileMenuOpen={isProfileMenuOpen}
        onCloseSessionLaunchError={() => setSessionLaunchError(null)}
        onToolMenuOpenChange={setIsToolMenuOpen}
        onUpdateSettings={(next) => void handleUpdateSettings(next)}
        openSidebar={openSidebar}
        profiles={settings.profiles.items}
        projectWorkspace={projectWorkspace}
        selectedSessionId={selectedSessionId}
        selectedSettingsGroup={selectedSettingsGroup}
        sessionLaunchError={sessionLaunchError}
        projectNameDialog={projectNameDialog}
        renamingSessionId={renamingSessionId}
        sessions={sessions}
        settings={settings}
        toolNotice={toolNotice}
      />
    </I18nProvider>
  );

  function handleStreamMetadata(sessionId: string, metadata: SessionStreamMetadata) {
    startTransition(() => {
      setSessions((current) => patchSessionMetadata(current, sessionId, metadata));
    });
  }

  function handleStreamMetadataDelta(sessionId: string, delta: SessionMetadataDelta) {
    startTransition(() => {
      setSessions((current) => patchSessionDelta(current, sessionId, delta));
    });
  }

  function handleStreamDetached(_sessionId: string) {
    void refreshWorkbench({ startupBehavior: "open_empty" });
  }

  async function handleProjectNameConfirm(name: string) {
    if (!projectNameDialog) {
      return;
    }

    if (projectNameDialog.mode === "create") {
      await handleCreateProjectConfirm(name);
      return;
    }

    await handleRenameProjectConfirm(projectNameDialog.projectId, name);
  }
}

type AppShellProps = {
  busy: boolean;
  currentProjectWindowId: string | null;
  defaultProfileId: string;
  isAboutDialogOpen: boolean;
  isProfileMenuOpen: boolean;
  isToolMenuOpen: boolean;
  onCheckForUpdates: () => void;
  onCloseAboutDialog: () => void;
  onCloseProjectNameDialog: () => void;
  onCloseSessionLaunchError: () => void;
  onCloseToolNotice: () => void;
  onActivatePane: (paneId: string) => void;
  onCloseProjectTab: (paneId: string, tabId: string) => void;
  onDetachProjectTab: (paneId: string, tabId: string, sessionId: string) => void;
  onMoveProjectTab: (
    sourcePaneId: string,
    tabId: string,
    targetPaneId: string,
    targetIndex: number
  ) => void;
  onMoveProjectTabToNewWindow: (
    sourcePaneId: string,
    tabId: string,
    releasePoint: { x: number; y: number }
  ) => void;
  onCloseProjectWindow: () => void;
  onCloseSession: (sessionId: string) => void;
  onCloseRenameDialog: () => void;
  onConfirmProjectName: (name: string) => void;
  onCreateProject: () => void;
  onCreateSession: () => void;
  onCreateSessionWithProfile: (profileId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onOpenAbout: () => void;
  onOpenSettingsTab: (title: string) => void;
  onOpenSidebarChange: (next: SidebarPanel | null) => void;
  onProfileMenuOpenChange: (next: boolean) => void;
  onRefresh: () => void;
  onProjectLayoutChange: (layout: ProjectPaneNode, activePaneId: string) => void;
  onRenameProject: (projectId: string) => void;
  onReorderProjects?: (projectIds: string[]) => void;
  onRenameSession: (sessionId: string) => void;
  onSetSessionBackground: (sessionId: string, background: boolean) => void;
  onRenameConfirm: (title: string) => void;
  onResetSettingsGroup: (group: SettingsGroup) => void;
  onSelectProject: (projectId: string) => void;
  onSelectProjectTab: (paneId: string, tabId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onSelectSettingsGroup: (group: SettingsGroup) => void;
  onSplitPane: (paneId: string, direction: PaneSplitDirection) => void;
  onStreamDetached: (sessionId: string) => void;
  onStreamError: (error: unknown) => void;
  onStreamMetadata: (sessionId: string, metadata: SessionStreamMetadata) => void;
  onStreamMetadataDelta: (sessionId: string, delta: SessionMetadataDelta) => void;
  shouldCloseSessionIfUnusedOnDispose: (tabId: string) => boolean;
  onToolMenuOpenChange: (next: boolean) => void;
  onUpdateSettings: (next: Partial<AppSettings>) => void;
  openSidebar: SidebarPanel | null;
  profiles: AppSettings["profiles"]["items"];
  projectWorkspace: ProjectWorkspace;
  selectedSessionId: string | null;
  selectedSettingsGroup: SettingsGroup;
  sessionLaunchError: string | null;
  projectNameDialog: ProjectNameDialogState;
  renamingSessionId: string | null;
  sessions: SessionSummary[];
  settings: AppSettings;
  toolNotice: ToolNotice;
};

function AppShell({
  busy,
  currentProjectWindowId,
  defaultProfileId,
  isAboutDialogOpen,
  isProfileMenuOpen,
  isToolMenuOpen,
  onCheckForUpdates,
  onCloseAboutDialog,
  onCloseProjectNameDialog,
  onCloseSessionLaunchError,
  onCloseToolNotice,
  onActivatePane,
  onCloseProjectTab,
  onDetachProjectTab,
  onMoveProjectTab,
  onMoveProjectTabToNewWindow,
  onCloseProjectWindow,
  onCloseSession,
  onCloseRenameDialog,
  onConfirmProjectName,
  onCreateProject,
  onCreateSession,
  onCreateSessionWithProfile,
  onDeleteProject,
  onOpenAbout,
  onOpenSettingsTab,
  onOpenSidebarChange,
  onProfileMenuOpenChange,
  onRefresh,
  onProjectLayoutChange,
  onRenameProject,
  onReorderProjects,
  onRenameSession,
  onSetSessionBackground,
  onRenameConfirm,
  onResetSettingsGroup,
  onSelectProject,
  onSelectProjectTab,
  onSelectSession,
  onSelectSettingsGroup,
  onSplitPane,
  onStreamDetached,
  onStreamError,
  onStreamMetadata,
  onStreamMetadataDelta,
  shouldCloseSessionIfUnusedOnDispose,
  onToolMenuOpenChange,
  onUpdateSettings,
  openSidebar,
  profiles,
  projectWorkspace,
  selectedSessionId,
  selectedSettingsGroup,
  sessionLaunchError,
  projectNameDialog,
  renamingSessionId,
  sessions,
  settings,
  toolNotice
}: AppShellProps) {
  const t = useT();
  const isProjectWindow = currentProjectWindowId !== null;

  function handleOpenSettings() {
    onToolMenuOpenChange(false);
    onOpenSettingsTab(getHtmlPageTitle("settings", t));
  }

  function handleCheckForUpdates() {
    onToolMenuOpenChange(false);
    onCheckForUpdates();
  }

  function handleOpenAbout() {
    onToolMenuOpenChange(false);
    onOpenAbout();
  }

  return (
    <div
      className="app-shell-root"
      data-theme-mode={settings.appearance.themeMode}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      <main
        className={
          isProjectWindow
            ? "workbench workbench-project-window"
            : `workbench ${openSidebar ? "workbench-sidebar-open" : "workbench-sidebar-closed"}`
        }
        data-theme={settings.appearance.themePreset}
      >
        <TitleBar onClose={isProjectWindow ? onCloseProjectWindow : undefined} />
        {!isProjectWindow ? (
          <ActivityRail
            isToolMenuOpen={isToolMenuOpen}
            onAbout={handleOpenAbout}
            onCheckForUpdates={handleCheckForUpdates}
            onOpenSidebarChange={onOpenSidebarChange}
            onSettings={handleOpenSettings}
            onToolMenuOpenChange={onToolMenuOpenChange}
            openSidebar={openSidebar}
          />
        ) : null}

        {!isProjectWindow && openSidebar ? (
          <SidebarHost
            busy={busy}
            defaultProfileId={defaultProfileId}
            onCloseSession={onCloseSession}
            onCreateProject={onCreateProject}
            onCreateSession={onCreateSession}
            onCreateSessionWithProfile={onCreateSessionWithProfile}
            onDeleteProject={onDeleteProject}
            onProfileMenuOpenChange={onProfileMenuOpenChange}
            onRefresh={onRefresh}
            onRenameProject={onRenameProject}
            onReorderProjects={onReorderProjects}
            onRenameSession={onRenameSession}
            onSetSessionBackground={onSetSessionBackground}
            onSelectProject={onSelectProject}
            onSelectSession={onSelectSession}
            openProfileMenu={isProfileMenuOpen}
            openSidebar={openSidebar}
            profiles={profiles}
            projectWorkspace={projectWorkspace}
            selectedSessionId={selectedSessionId}
            sessions={sessions}
          />
        ) : null}

        <WorkbenchMain
          busy={busy}
          defaultProfileId={defaultProfileId}
          onCreateSession={onCreateSession}
          onCreateSessionWithProfile={onCreateSessionWithProfile}
          onActivatePane={onActivatePane}
          onCloseProjectTab={onCloseProjectTab}
          onDetachProjectTab={onDetachProjectTab}
          onMoveProjectTab={onMoveProjectTab}
          onMoveProjectTabToNewWindow={onMoveProjectTabToNewWindow}
          onProjectLayoutChange={onProjectLayoutChange}
          onRenameSession={onRenameSession}
          onResetSettingsGroup={onResetSettingsGroup}
          onSelectProjectTab={onSelectProjectTab}
          onSelectSettingsGroup={onSelectSettingsGroup}
          onSplitPane={onSplitPane}
          onStreamDetached={onStreamDetached}
          onStreamError={onStreamError}
          onStreamMetadata={onStreamMetadata}
          onStreamMetadataDelta={onStreamMetadataDelta}
          shouldCloseSessionIfUnusedOnDispose={shouldCloseSessionIfUnusedOnDispose}
          onUpdateSettings={onUpdateSettings}
          profiles={profiles}
          projectWindowId={currentProjectWindowId}
          projectWorkspace={projectWorkspace}
          selectedSettingsGroup={selectedSettingsGroup}
          sessions={sessions}
          settings={settings}
        />
        {!isProjectWindow ? <UtilityPanelHost isVisible={false} /> : null}
      </main>

      {toolNotice ? (
        <div className="status-toast">
          <span>{getToolNoticeMessage(toolNotice, t)}</span>
          <button onClick={onCloseToolNotice} type="button">
            {t(APP_MESSAGES.dismiss)}
          </button>
        </div>
      ) : null}

      <AboutDialog isOpen={isAboutDialogOpen} onClose={onCloseAboutDialog} />
      <ProjectNameDialog
        currentName={projectNameDialog?.mode === "rename" ? projectNameDialog.currentName : ""}
        isOpen={projectNameDialog !== null}
        mode={projectNameDialog?.mode ?? "create"}
        onClose={onCloseProjectNameDialog}
        onConfirm={onConfirmProjectName}
      />
      <ModalDialog
        footer={
          <button className="settings-reset-button" onClick={onCloseSessionLaunchError} type="button">
            {t(APP_MESSAGES.close)}
          </button>
        }
        isOpen={sessionLaunchError !== null}
        onClose={onCloseSessionLaunchError}
        title={t(APP_MESSAGES.sessionLaunchErrorTitle)}
      >
        <div className="dialog-error-layout">
          <p className="dialog-error-copy">{t(APP_MESSAGES.sessionLaunchErrorCopy)}</p>
          <p className="dialog-error-label">{t(APP_MESSAGES.sessionLaunchErrorDetailsLabel)}</p>
          <pre className="dialog-error-details">{sessionLaunchError ?? ""}</pre>
        </div>
      </ModalDialog>

      <RenameSessionDialog
        isOpen={renamingSessionId !== null}
        currentTitle={sessions.find((s) => s.sessionId === renamingSessionId)?.title ?? ""}
        onClose={onCloseRenameDialog}
        onConfirm={onRenameConfirm}
      />
    </div>
  );
}

function getToolNoticeMessage(toolNotice: ToolNotice, t: ReturnType<typeof useT>) {
  switch (toolNotice) {
    case "check_updates_unavailable":
      return t(APP_MESSAGES.checkUpdatesUnavailable);
    default:
      return "";
  }
}

function getSystemLocale() {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  return navigator.languages?.[0] ?? navigator.language;
}

function isLiveSessionStatus(status: SessionStatus) {
  return status === "running" || status === "background";
}

async function persistProjectWindowLayout(
  workspace: ProjectWorkspace,
  windowId: string | null,
  options?: { closeSessionIfUnused?: string | null }
) {
  const activeProject = getActiveProject(workspace);
  if (!activeProject) {
    return;
  }

  if (windowId !== null) {
    const projectWindow = activeProject.extraWindows.find((window) => window.windowId === windowId);
    if (!projectWindow) {
      return;
    }
    await invoke("update_project_window_layout", {
      request: {
        projectId: activeProject.projectId,
        windowId,
        activePaneId: projectWindow.activePaneId,
        layout: projectWindow.layout,
        closeSessionIfUnused: options?.closeSessionIfUnused ?? null
      }
    });
    return;
  }

  await invoke("update_project_layout", {
    request: {
      projectId: activeProject.projectId,
      activePaneId: activeProject.activePaneId,
      layout: activeProject.layout,
      closeSessionIfUnused: options?.closeSessionIfUnused ?? null
    }
  });
}

function transformProjectWindowLayout(
  workspace: ProjectWorkspace,
  windowId: string | null,
  transform: (workspace: ProjectWorkspace) => ProjectWorkspace
): ProjectWorkspace {
  if (windowId === null) {
    return transform(workspace);
  }

  const activeProject = getActiveProject(workspace);
  const projectWindow = activeProject?.extraWindows.find((window) => window.windowId === windowId);
  if (!activeProject || !projectWindow) {
    return workspace;
  }

  const temporaryWorkspace: ProjectWorkspace = {
    activeProjectId: activeProject.projectId,
    projects: [
      {
        ...activeProject,
        activePaneId: projectWindow.activePaneId,
        layout: projectWindow.layout,
        extraWindows: []
      }
    ]
  };
  const transformedProject = getActiveProject(transform(temporaryWorkspace));
  if (!transformedProject) {
    return workspace;
  }

  return updateProjectWindowView(
    workspace,
    activeProject.projectId,
    windowId,
    transformedProject.layout,
    transformedProject.activePaneId
  );
}

function updateProjectWindowView(
  workspace: ProjectWorkspace,
  projectId: string,
  windowId: string | null,
  layout: ProjectPaneNode,
  activePaneId: string
): ProjectWorkspace {
  return {
    ...workspace,
    projects: workspace.projects.map((project) => {
      if (project.projectId !== projectId) {
        return project;
      }

      if (windowId === null) {
        return {
          ...project,
          activePaneId,
          layout
        };
      }

      return {
        ...project,
        extraWindows: project.extraWindows.map((window) =>
          window.windowId === windowId
            ? {
                ...window,
                activePaneId,
                layout
              }
            : window
        )
      };
    })
  };
}

function getProjectWindowView(
  project: ProjectSummary | null,
  windowId: string | null
): { activePaneId: string; layout: ProjectPaneNode } | null {
  if (!project) {
    return null;
  }

  if (windowId === null) {
    return {
      activePaneId: project.activePaneId,
      layout: project.layout
    };
  }

  return project.extraWindows.find((window) => window.windowId === windowId) ?? null;
}

function projectWorkspaceHasNoTabs(workspace: ProjectWorkspace) {
  return workspace.projects.every(
    (project) =>
      paneTabCount(project.layout) === 0 &&
      project.extraWindows.every((window) => paneTabCount(window.layout) === 0)
  );
}

function paneTabCount(node: ProjectPaneNode): number {
  if (node.type === "leaf") {
    return node.tabs.length;
  }

  return paneTabCount(node.first) + paneTabCount(node.second);
}

function getSelectedSessionId(workspace: ProjectWorkspace, sessions: SessionSummary[]) {
  const activeProject = getActiveProject(workspace);
  if (!activeProject) {
    return null;
  }
  const activeTab = findActiveProjectTab(activeProject.layout, activeProject.activePaneId);
  if (!activeTab?.sessionId) {
    return null;
  }

  return sessions.some((session) => session.sessionId === activeTab.sessionId)
    ? activeTab.sessionId
    : null;
}

function findActiveProjectTab(node: ProjectPaneNode, paneId: string): ProjectTab | null {
  if (node.type === "leaf") {
    if (node.paneId !== paneId) {
      return null;
    }
    return node.tabs.find((tab) => tab.tabId === node.activeTabId) ?? node.tabs[0] ?? null;
  }

  return findActiveProjectTab(node.first, paneId) ?? findActiveProjectTab(node.second, paneId);
}

function findProjectTab(node: ProjectPaneNode, paneId: string, tabId: string): ProjectTab | null {
  if (node.type === "leaf") {
    if (node.paneId !== paneId) {
      return null;
    }
    return node.tabs.find((tab) => tab.tabId === tabId) ?? null;
  }

  return findProjectTab(node.first, paneId, tabId) ?? findProjectTab(node.second, paneId, tabId);
}

function getCurrentProjectWindowId(): string | null {
  const label = getCurrentWindow().label;
  if (label?.startsWith(PROJECT_WINDOW_LABEL_PREFIX)) {
    return label.slice(PROJECT_WINDOW_LABEL_PREFIX.length);
  }

  if (typeof window === "undefined") {
    return null;
  }

  return new URLSearchParams(window.location.search).get("projectWindowId");
}

function findProjectWindow(workspace: ProjectWorkspace, windowId: string | null) {
  if (!windowId) {
    return null;
  }

  return (
    getActiveProject(workspace)?.extraWindows.find((window) => window.windowId === windowId) ?? null
  );
}

async function createProjectWindowGeometry(releasePoint: {
  x: number;
  y: number;
}): Promise<ProjectWindowGeometry> {
  const currentPosition = await getCurrentWindow().outerPosition();
  return {
    x: currentPosition.x + releasePoint.x,
    y: currentPosition.y + releasePoint.y,
    width: EXTRA_WINDOW_DEFAULT_WIDTH,
    height: EXTRA_WINDOW_DEFAULT_HEIGHT,
    maximized: false
  };
}

async function readCurrentProjectWindowGeometry(): Promise<ProjectWindowGeometry> {
  const appWindow = getCurrentWindow();
  const [position, size, maximized] = await Promise.all([
    appWindow.outerPosition(),
    appWindow.outerSize(),
    appWindow.isMaximized()
  ]);
  return {
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    maximized
  };
}

async function reconcileProjectWindows(workspace: ProjectWorkspace) {
  const activeProject = getActiveProject(workspace);
  if (!activeProject) {
    return;
  }

  try {
    const { getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
    const windows = await getAllWebviewWindows();
    const desiredLabels = new Set(
      activeProject.extraWindows.map((window) => getProjectWindowLabel(window.windowId))
    );

    await Promise.all(
      windows
        .filter(
          (window) =>
            window.label.startsWith(PROJECT_WINDOW_LABEL_PREFIX) && !desiredLabels.has(window.label)
        )
        .map((window) => window.close())
    );

    const existingLabels = new Set(windows.map((window) => window.label));
    await Promise.all(
      activeProject.extraWindows
        .filter((window) => !existingLabels.has(getProjectWindowLabel(window.windowId)))
        .map((window) => openProjectWindow(window))
    );
  } catch (error) {
    logDesktopError(error);
  }
}

async function openProjectWindow(projectWindow: ProjectWindow) {
  const label = getProjectWindowLabel(projectWindow.windowId);
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.setFocus();
    return;
  }

  const webviewWindow = new WebviewWindow(label, {
    decorations: false,
    focus: true,
    height: projectWindow.geometry.height,
    minHeight: 420,
    minWidth: 720,
    preventOverflow: true,
    resizable: true,
    title: "Aria Terminal",
    url: `/?projectWindowId=${projectWindow.windowId}`,
    width: projectWindow.geometry.width,
    x: projectWindow.geometry.x,
    y: projectWindow.geometry.y
  });
  if (projectWindow.geometry.maximized) {
    await webviewWindow.once("tauri://created", () => {
      void webviewWindow.maximize();
    });
  }
}

async function broadcastProjectWorkspace(workspace: ProjectWorkspace) {
  try {
    const { getAllWebviewWindows } = await import("@tauri-apps/api/webviewWindow");
    const windows = await getAllWebviewWindows();
    await Promise.all(
      windows.map((window) => window.emit(PROJECT_WORKSPACE_UPDATED_EVENT, workspace))
    );
  } catch (error) {
    logDesktopError(error);
  }
}

async function closeCurrentTauriWindow() {
  try {
    await getCurrentWindow().close();
  } catch (error) {
    logDesktopError(error);
  }
}

function getProjectWindowLabel(windowId: string) {
  return `${PROJECT_WINDOW_LABEL_PREFIX}${windowId}`;
}

function patchSessionMetadata(
  sessions: SessionSummary[],
  sessionId: string,
  metadata: SessionStreamMetadata
) {
  return sessions.map((session) =>
    session.sessionId === sessionId
      ? {
          ...session,
          title: metadata.title,
          status: metadata.status
        }
      : session
  );
}

function patchSessionDelta(
  sessions: SessionSummary[],
  sessionId: string,
  delta: SessionMetadataDelta
) {
  return sessions.map((session) =>
    session.sessionId === sessionId
      ? {
          ...session,
          title: delta.title ?? session.title,
          status: delta.status ?? session.status
        }
      : session
  );
}

function logDesktopError(error: unknown) {
  console.error(error);
}

function describeDesktopError(error: unknown) {
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;

    for (const key of ["message", "error", "cause"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }

    try {
      const encoded = JSON.stringify(error);
      if (encoded && encoded !== "{}") {
        return encoded;
      }
    } catch (_jsonError) {
      // Fall through to the generic message below.
    }
  }

  return "Unknown error";
}
