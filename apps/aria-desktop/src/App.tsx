import { invoke } from "@tauri-apps/api/core";
import {
  type AppSettings,
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
  closeWorkbenchTab,
  createHtmlTab,
  createTerminalTab,
  openWorkbenchTab,
  reconcileOpenTabs,
  type WorkbenchTab
} from "./components/workbench/main/tabState";
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
  const [tabs, setTabs] = useState<WorkbenchTab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(cloneSettings(DEFAULT_APP_SETTINGS));
  const [selectedSettingsGroup, setSelectedSettingsGroup] =
    useState<SettingsGroup>("appearance");
  const [busy, setBusy] = useState(false);
  const [openSidebar, setOpenSidebar] = useState<SidebarPanel | null>("sessions");
  const [isToolMenuOpen, setIsToolMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [toolNotice, setToolNotice] = useState<ToolNotice>(null);
  const [sessionLaunchError, setSessionLaunchError] = useState<string | null>(null);

  const selectedTabIdRef = useRef<string | null>(null);
  const tabsRef = useRef<WorkbenchTab[]>([]);
  const settingsRef = useRef<AppSettings>(cloneSettings(DEFAULT_APP_SETTINGS));
  const settingsStoreRef = useRef(
    createSettingsStore({
      get: () => invoke<AppSettings>("get_app_settings"),
      update: (payload) => invoke<AppSettings>("update_app_settings", { settings: payload }),
      resetGroup: (group) => invoke<AppSettings>("reset_app_settings_group", { group })
    })
  );

  const activeTab = tabs.find((tab) => tab.id === selectedTabId) ?? null;
  const selectedSessionId = activeTab?.type === "terminal" ? activeTab.sessionId : null;
  const systemLocale = getSystemLocale();

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    selectedTabIdRef.current = selectedTabId;
  }, [selectedTabId]);

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

  function applyTabState(nextTabState: { tabs: WorkbenchTab[]; selectedTabId: string | null }) {
    setTabs(nextTabState.tabs);
    setSelectedTabId(nextTabState.selectedTabId);
  }

  async function refreshWorkbench(options?: {
    ensureTab?: WorkbenchTab;
    startupBehavior?: AppSettings["workspace"]["startupBehavior"];
  }) {
    setBusy(true);

    try {
      const nextSessions = await invoke<SessionSummary[]>("list_sessions");
      const availableSessionIds = nextSessions.map((session) => session.sessionId);
      const startupTab =
        !options?.ensureTab &&
        tabsRef.current.length === 0 &&
        (options?.startupBehavior ?? settingsRef.current.workspace.startupBehavior) ===
          "restore_previous" &&
        nextSessions[0]
          ? createTerminalTab(nextSessions[0].sessionId)
          : undefined;
      const nextTabState = reconcileOpenTabs(
        options?.ensureTab || startupTab
          ? openWorkbenchTab(
              tabsRef.current,
              selectedTabIdRef.current,
              options?.ensureTab ?? startupTab!
            ).tabs
          : tabsRef.current,
        options?.ensureTab?.id ?? startupTab?.id ?? selectedTabIdRef.current,
        availableSessionIds
      );

      startTransition(() => {
        setSessions(nextSessions);
      });
      applyTabState(nextTabState);
    } catch (error) {
      logDesktopError(error);
    } finally {
      setBusy(false);
    }
  }

  function handleSelectSession(sessionId: string) {
    applyTabState(
      openWorkbenchTab(tabsRef.current, selectedTabIdRef.current, createTerminalTab(sessionId))
    );
  }

  function handleSelectTab(tabId: string) {
    if (tabId === selectedTabIdRef.current) {
      return;
    }
    setSelectedTabId(tabId);
  }

  function handleCloseTab(tabId: string) {
    applyTabState(closeWorkbenchTab(tabsRef.current, selectedTabIdRef.current, tabId));
  }

  async function handleCreateSession(profileId?: string) {
    setBusy(true);
    setIsProfileMenuOpen(false);
    setSessionLaunchError(null);

    try {
      const created = await invoke<{ sessionId: string }>("create_local_session", {
        cols: 120,
        rows: 32,
        profileId
      });
      await refreshWorkbench({ ensureTab: createTerminalTab(created.sessionId) });
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

  function handleOpenSettingsTab(title: string) {
    applyTabState(
      openWorkbenchTab(tabsRef.current, selectedTabIdRef.current, createHtmlTab("settings", title))
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
        activeTab={activeTab}
        busy={busy}
        isAboutDialogOpen={isAboutDialogOpen}
        isToolMenuOpen={isToolMenuOpen}
        onCheckForUpdates={() => setToolNotice("check_updates_unavailable")}
        onCloseAboutDialog={() => setIsAboutDialogOpen(false)}
        onCloseToolNotice={() => setToolNotice(null)}
        onCloseTab={handleCloseTab}
        onCreateSession={() => void handleCreateSession(settings.profiles.defaultProfileId)}
        onCreateSessionWithProfile={(profileId) => void handleCreateSession(profileId)}
        onOpenAbout={() => setIsAboutDialogOpen(true)}
        onOpenSettingsTab={handleOpenSettingsTab}
        onOpenSidebarChange={setOpenSidebar}
        onProfileMenuOpenChange={setIsProfileMenuOpen}
        onRefresh={() => void refreshWorkbench()}
        onResetSettingsGroup={handleResetSettingsGroup}
        onSelectSession={handleSelectSession}
        onSelectSettingsGroup={setSelectedSettingsGroup}
        onSelectTab={handleSelectTab}
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
        selectedSessionId={selectedSessionId}
        selectedSettingsGroup={selectedSettingsGroup}
        sessionLaunchError={sessionLaunchError}
        sessions={sessions}
        settings={settings}
        tabs={tabs}
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
}

type AppShellProps = {
  activeTab: WorkbenchTab | null;
  busy: boolean;
  defaultProfileId: string;
  isAboutDialogOpen: boolean;
  isProfileMenuOpen: boolean;
  isToolMenuOpen: boolean;
  onCheckForUpdates: () => void;
  onCloseAboutDialog: () => void;
  onCloseSessionLaunchError: () => void;
  onCloseToolNotice: () => void;
  onCloseTab: (tabId: string) => void;
  onCreateSession: () => void;
  onCreateSessionWithProfile: (profileId: string) => void;
  onOpenAbout: () => void;
  onOpenSettingsTab: (title: string) => void;
  onOpenSidebarChange: (next: SidebarPanel | null) => void;
  onProfileMenuOpenChange: (next: boolean) => void;
  onRefresh: () => void;
  onResetSettingsGroup: (group: SettingsGroup) => void;
  onSelectSession: (sessionId: string) => void;
  onSelectSettingsGroup: (group: SettingsGroup) => void;
  onSelectTab: (tabId: string) => void;
  onStreamDetached: (sessionId: string) => void;
  onStreamError: (error: unknown) => void;
  onStreamMetadata: (sessionId: string, metadata: SessionStreamMetadata) => void;
  onStreamMetadataDelta: (sessionId: string, delta: SessionMetadataDelta) => void;
  onToolMenuOpenChange: (next: boolean) => void;
  onUpdateSettings: (next: Partial<AppSettings>) => void;
  openSidebar: SidebarPanel | null;
  profiles: AppSettings["profiles"]["items"];
  selectedSessionId: string | null;
  selectedSettingsGroup: SettingsGroup;
  sessionLaunchError: string | null;
  sessions: SessionSummary[];
  settings: AppSettings;
  tabs: WorkbenchTab[];
  toolNotice: ToolNotice;
};

function AppShell({
  activeTab,
  busy,
  defaultProfileId,
  isAboutDialogOpen,
  isProfileMenuOpen,
  isToolMenuOpen,
  onCheckForUpdates,
  onCloseAboutDialog,
  onCloseSessionLaunchError,
  onCloseToolNotice,
  onCloseTab,
  onCreateSession,
  onCreateSessionWithProfile,
  onOpenAbout,
  onOpenSettingsTab,
  onOpenSidebarChange,
  onProfileMenuOpenChange,
  onRefresh,
  onResetSettingsGroup,
  onSelectSession,
  onSelectSettingsGroup,
  onSelectTab,
  onStreamDetached,
  onStreamError,
  onStreamMetadata,
  onStreamMetadataDelta,
  onToolMenuOpenChange,
  onUpdateSettings,
  openSidebar,
  profiles,
  selectedSessionId,
  selectedSettingsGroup,
  sessionLaunchError,
  sessions,
  settings,
  tabs,
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
            onCreateSession={onCreateSession}
            onCreateSessionWithProfile={onCreateSessionWithProfile}
            onProfileMenuOpenChange={onProfileMenuOpenChange}
            onRefresh={onRefresh}
            onSelectSession={onSelectSession}
            openProfileMenu={isProfileMenuOpen}
            openSidebar={openSidebar}
            profiles={profiles}
            selectedSessionId={selectedSessionId}
            sessions={sessions}
          />
        ) : null}

        <WorkbenchMain
          activeTab={activeTab}
          onCloseTab={onCloseTab}
          onResetSettingsGroup={onResetSettingsGroup}
          onSelectSettingsGroup={onSelectSettingsGroup}
          onSelectTab={onSelectTab}
          onStreamDetached={onStreamDetached}
          onStreamError={onStreamError}
          onStreamMetadata={onStreamMetadata}
          onStreamMetadataDelta={onStreamMetadataDelta}
          onUpdateSettings={onUpdateSettings}
          selectedSettingsGroup={selectedSettingsGroup}
          sessions={sessions}
          settings={settings}
          tabs={tabs}
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
