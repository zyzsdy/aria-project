import { invoke } from "@tauri-apps/api/core";
import {
  type AppSettings,
  type CreateLocalSessionResponse,
  type PaneSplitDirection,
  type ProjectPaneNode,
  type ProjectSummary,
  type ProjectTab,
  type ProjectWorkspace,
  type SessionMetadataDelta,
  type SessionStreamMetadata,
  type SessionSummary,
  type SettingsGroup,
  type UpdateAppSettingsPayload
} from "@aria/types";
import { startTransition, useEffect, useRef, useState } from "react";
import { ModalDialog } from "./components/ModalDialog";
import { AboutDialog } from "./components/workbench/AboutDialog";
import { ActivityRail } from "./components/workbench/ActivityRail";
import { WorkbenchMain } from "./components/workbench/main/WorkbenchMain";
import { getHtmlPageTitle } from "./components/workbench/main/htmlPageTitles";
import {
  addSessionTabToActivePane,
  closeProjectTab,
  createEmptyProjectWorkspace,
  getActiveProject,
  openHtmlTabInActiveProject,
  selectProject,
  selectProjectTab,
  splitActivePane
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
import { DEFAULT_APP_SETTINGS, cloneSettings } from "./settings/appSettings";
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

export function App() {
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
        !sessions.some((session) => session.status === "running")
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
        await persistActiveProjectLayout(nextWorkspace);
      }
    } catch (error) {
      logDesktopError(error);
    } finally {
      setBusy(false);
    }
  }

  async function applyProjectWorkspace(nextWorkspace: ProjectWorkspace, persist = true) {
    projectWorkspaceRef.current = nextWorkspace;
    setProjectWorkspace(nextWorkspace);
    if (persist) {
      await persistActiveProjectLayout(nextWorkspace);
    }
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
      addSessionTabToActivePane(projectWorkspaceRef.current, session)
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
    } catch (error) {
      logDesktopError(error);
    }
  }

  async function handleActivatePane(paneId: string) {
    const activeProject = getActiveProject(projectWorkspaceRef.current);
    if (!activeProject || activeProject.activePaneId === paneId) {
      return;
    }
    const nextWorkspace = {
      ...projectWorkspaceRef.current,
      projects: projectWorkspaceRef.current.projects.map((project) =>
        project.projectId === activeProject.projectId ? { ...project, activePaneId: paneId } : project
      )
    };
    await applyProjectWorkspace(nextWorkspace);
  }

  async function handleSelectProjectTab(paneId: string, tabId: string) {
    await applyProjectWorkspace(selectProjectTab(projectWorkspaceRef.current, paneId, tabId));
  }

  async function handleCloseProjectTab(paneId: string, tabId: string) {
    await applyProjectWorkspace(closeProjectTab(projectWorkspaceRef.current, paneId, tabId));
  }

  async function handleSplitPane(direction: PaneSplitDirection) {
    await applyProjectWorkspace(splitActivePane(projectWorkspaceRef.current, direction));
  }

  async function handleProjectLayoutChange(layout: ProjectPaneNode, activePaneId: string) {
    const activeProject = getActiveProject(projectWorkspaceRef.current);
    if (!activeProject) {
      return;
    }
    const nextWorkspace = {
      ...projectWorkspaceRef.current,
      projects: projectWorkspaceRef.current.projects.map((project) =>
        project.projectId === activeProject.projectId
          ? { ...project, layout, activePaneId }
          : project
      )
    };
    await applyProjectWorkspace(nextWorkspace);
  }

  function handleRenameSession(sessionId: string) {
    setRenamingSessionId(sessionId);
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
      await applyProjectWorkspace(addSessionTabToActivePane(projectWorkspaceRef.current, session));
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
      openHtmlTabInActiveProject(projectWorkspaceRef.current, "settings", title)
    );
  }

  return (
    <I18nProvider
      locale={settings.localization.locale}
      namespaces={DESKTOP_I18N_NAMESPACES}
      sources={CATALOG_SOURCES}
      systemLocale={systemLocale}
    >
      <AppShell
        busy={busy}
        isAboutDialogOpen={isAboutDialogOpen}
        isToolMenuOpen={isToolMenuOpen}
        onCheckForUpdates={() => setToolNotice("check_updates_unavailable")}
        onCloseAboutDialog={() => setIsAboutDialogOpen(false)}
        onCloseToolNotice={() => setToolNotice(null)}
        onActivatePane={(paneId) => void handleActivatePane(paneId)}
        onCloseProjectTab={(paneId, tabId) => void handleCloseProjectTab(paneId, tabId)}
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
        onRenameSession={handleRenameSession}
        onRenameConfirm={handleRenameConfirm}
        onResetSettingsGroup={handleResetSettingsGroup}
        onSelectProject={(projectId) => void handleSelectProject(projectId)}
        onSelectProjectTab={(paneId, tabId) => void handleSelectProjectTab(paneId, tabId)}
        onSelectSession={handleSelectSession}
        onSelectSettingsGroup={setSelectedSettingsGroup}
        onSplitPane={(direction) => void handleSplitPane(direction)}
        onStreamDetached={handleStreamDetached}
        onStreamError={logDesktopError}
        onStreamMetadata={handleStreamMetadata}
        onStreamMetadataDelta={handleStreamMetadataDelta}
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
    void refreshWorkbench();
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
  onRenameSession: (sessionId: string) => void;
  onRenameConfirm: (title: string) => void;
  onResetSettingsGroup: (group: SettingsGroup) => void;
  onSelectProject: (projectId: string) => void;
  onSelectProjectTab: (paneId: string, tabId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onSelectSettingsGroup: (group: SettingsGroup) => void;
  onSplitPane: (direction: PaneSplitDirection) => void;
  onStreamDetached: (sessionId: string) => void;
  onStreamError: (error: unknown) => void;
  onStreamMetadata: (sessionId: string, metadata: SessionStreamMetadata) => void;
  onStreamMetadataDelta: (sessionId: string, delta: SessionMetadataDelta) => void;
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
  onRenameSession,
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
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      <main
        className={`workbench ${openSidebar ? "workbench-sidebar-open" : "workbench-sidebar-closed"}`}
        data-theme={settings.appearance.themePreset}
      >
        <ActivityRail
          isToolMenuOpen={isToolMenuOpen}
          onAbout={handleOpenAbout}
          onCheckForUpdates={handleCheckForUpdates}
          onOpenSidebarChange={onOpenSidebarChange}
          onSettings={handleOpenSettings}
          onToolMenuOpenChange={onToolMenuOpenChange}
          openSidebar={openSidebar}
        />

        {openSidebar ? (
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
            onRenameSession={onRenameSession}
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
          onProjectLayoutChange={onProjectLayoutChange}
          onResetSettingsGroup={onResetSettingsGroup}
          onSelectProjectTab={onSelectProjectTab}
          onSelectSettingsGroup={onSelectSettingsGroup}
          onSplitPane={onSplitPane}
          onStreamDetached={onStreamDetached}
          onStreamError={onStreamError}
          onStreamMetadata={onStreamMetadata}
          onStreamMetadataDelta={onStreamMetadataDelta}
          onUpdateSettings={onUpdateSettings}
          profiles={profiles}
          projectWorkspace={projectWorkspace}
          selectedSettingsGroup={selectedSettingsGroup}
          sessions={sessions}
          settings={settings}
        />
        <UtilityPanelHost isVisible={false} />
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

async function persistActiveProjectLayout(workspace: ProjectWorkspace) {
  const activeProject = getActiveProject(workspace);
  if (!activeProject) {
    return;
  }

  await invoke("update_project_layout", {
    request: {
      projectId: activeProject.projectId,
      activePaneId: activeProject.activePaneId,
      layout: activeProject.layout
    }
  });
}

function projectWorkspaceHasNoTabs(workspace: ProjectWorkspace) {
  return workspace.projects.every((project) => paneTabCount(project.layout) === 0);
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
