import { Channel, invoke } from "@tauri-apps/api/core";
import {
  type AppSettings,
  type AttachViewerResponse,
  type SessionMetadataDelta,
  type SessionStreamFrame,
  type SessionStreamMetadata,
  type SessionSummary,
  type SettingsGroup,
  type UpdateAppSettingsPayload
} from "@aria/types";
import { CanvasAddon } from "@xterm/addon-canvas";
import { FitAddon } from "@xterm/addon-fit";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { AboutDialog } from "./components/workbench/AboutDialog";
import { ActivityRail } from "./components/workbench/ActivityRail";
import { WorkbenchMain } from "./components/workbench/main/WorkbenchMain";
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
import { DEFAULT_APP_SETTINGS, applySettingsToTerminal, cloneSettings } from "./settings/appSettings";
import { createSettingsStore } from "./settings/settingsStore";
import { createTerminalOptions } from "./terminal/options";
import { activateUnicode11 } from "./terminal/unicode";

type StreamState = "detached" | "attaching" | "attached" | "reconnecting";

const SETTINGS_TAB = createHtmlTab("settings", "Settings");

export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [tabs, setTabs] = useState<WorkbenchTab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(cloneSettings(DEFAULT_APP_SETTINGS));
  const [selectedSettingsGroup, setSelectedSettingsGroup] =
    useState<SettingsGroup>("appearance");
  const [streamState, setStreamState] = useState<StreamState>("detached");
  const [busy, setBusy] = useState(false);
  const [openSidebar, setOpenSidebar] = useState<SidebarPanel | null>("sessions");
  const [isToolMenuOpen, setIsToolMenuOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [toolMessage, setToolMessage] = useState<string | null>(null);
  const [terminalHost, setTerminalHost] = useState<HTMLDivElement | null>(null);
  const [terminalReady, setTerminalReady] = useState(false);
  const [streamRevision, setStreamRevision] = useState(0);

  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const selectedTabIdRef = useRef<string | null>(null);
  const tabsRef = useRef<WorkbenchTab[]>([]);
  const settingsRef = useRef<AppSettings>(cloneSettings(DEFAULT_APP_SETTINGS));
  const scheduledSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);
  const settingsStoreRef = useRef(
    createSettingsStore({
      get: () => invoke<AppSettings>("get_app_settings"),
      update: (payload) => invoke<AppSettings>("update_app_settings", { settings: payload }),
      resetGroup: (group) => invoke<AppSettings>("reset_app_settings_group", { group })
    })
  );

  const activeTab = tabs.find((tab) => tab.id === selectedTabId) ?? null;
  const selectedSessionId = activeTab?.type === "terminal" ? activeTab.sessionId : null;

  const handleTerminalHostRef = useCallback((node: HTMLDivElement | null) => {
    setTerminalHost(node);
  }, []);

  useEffect(() => {
    activeSessionIdRef.current = selectedSessionId;
    selectedTabIdRef.current = selectedTabId;
  }, [selectedSessionId, selectedTabId]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

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
    if (!terminalHost) {
      return;
    }

    const terminal = new Terminal(createTerminalOptions(settings));
    applySettingsToTerminal(terminal, settings);

    const fitAddon = new FitAddon();
    const canvasAddon = new CanvasAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(canvasAddon);
    activateUnicode11(terminal);
    terminal.open(terminalHost);
    fitAddon.fit();

    const disposeData = terminal.onData((data: string) => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) {
        return;
      }
      void invoke("write_session", { sessionId, data }).catch(logDesktopError);
    });

    const disposeResize = terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) {
        return;
      }
      void invoke("resize_session", { sessionId, cols, rows }).catch(logDesktopError);
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminalHost);

    const handleContextMenu = (event: MouseEvent) => {
      if (settingsRef.current.terminal.rightClickBehavior === "menu") {
        return;
      }

      event.preventDefault();
      const sessionId = activeSessionIdRef.current;
      if (!sessionId || !navigator.clipboard?.readText) {
        return;
      }

      void navigator.clipboard
        .readText()
        .then((text) => {
          if (!text) {
            return;
          }
          return invoke("write_session", { sessionId, data: text });
        })
        .catch(() => undefined);
    };
    terminalHost.addEventListener("contextmenu", handleContextMenu);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    setTerminalReady(true);

    return () => {
      setTerminalReady(false);
      terminalHost.removeEventListener("contextmenu", handleContextMenu);
      resizeObserver.disconnect();
      disposeResize.dispose();
      disposeData.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [terminalHost]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    applySettingsToTerminal(terminal, settings);
    fitAddonRef.current?.fit();
  }, [settings]);

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

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !selectedSessionId) {
      setStreamState("detached");
      return;
    }

    let cancelled = false;
    let attachedViewerId: string | null = null;
    const isReconnect = appliedSeqRef.current > 0;
    setStreamState(isReconnect ? "reconnecting" : "attaching");
    terminal.reset();
    terminal.clear();

    const requestResync = () => {
      if (cancelled) {
        return;
      }
      scheduledSeqRef.current = appliedSeqRef.current;
      setStreamState("reconnecting");
      setStreamRevision((current) => current + 1);
    };

    const acknowledge = (viewerId: string, seq: number) => {
      appliedSeqRef.current = seq;
      void invoke("viewer_ack", { viewerId, seq }).catch(() => undefined);
    };

    const applyFrame = (frame: SessionStreamFrame) => {
      const expected =
        scheduledSeqRef.current === 0 ? frame.seq : scheduledSeqRef.current + 1;
      if (frame.seq !== expected) {
        requestResync();
        return;
      }
      scheduledSeqRef.current = frame.seq;

      if (frame.type === "terminal.rehydrate") {
        terminal.reset();
        terminal.clear();
        terminal.write(decodePayload(frame.vtPayload), () => {
          acknowledge(frame.viewerId, frame.seq);
        });
        startTransition(() => {
          setSessions((current) =>
            patchSessionMetadata(current, frame.sessionId, frame.metadata)
          );
        });
        return;
      }

      if (frame.type === "terminal.bytes") {
        terminal.write(decodePayload(frame.bytes), () => {
          acknowledge(frame.viewerId, frame.seq);
        });
        return;
      }

      if (frame.type === "session.metadata") {
        startTransition(() => {
          setSessions((current) => patchSessionDelta(current, frame.sessionId, frame.metadata));
        });
        acknowledge(frame.viewerId, frame.seq);
        return;
      }

      setStreamState("detached");
      acknowledge(frame.viewerId, frame.seq);
    };

    const channel = new Channel<SessionStreamFrame>((frame) => {
      if (!cancelled) {
        applyFrame(frame);
      }
    });

    void invoke<AttachViewerResponse>("attach_session_stream", {
      sessionId: selectedSessionId,
      cols: terminal.cols || 80,
      rows: terminal.rows || 24,
      replayFromSeq: isReconnect ? appliedSeqRef.current : undefined,
      stream: channel
    })
      .then(({ viewerId }) => {
        if (cancelled) {
          return;
        }
        attachedViewerId = viewerId;
        startTransition(() => {
          setStreamState("attached");
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        logDesktopError(error);
        setStreamState("detached");
      });

    return () => {
      cancelled = true;
      if (attachedViewerId) {
        void invoke("detach_viewer", { viewerId: attachedViewerId }).catch(() => undefined);
      }
    };
  }, [selectedSessionId, streamRevision, terminalReady]);

  function resetStreamSequence() {
    scheduledSeqRef.current = 0;
    appliedSeqRef.current = 0;
  }

  function applyTabState(nextTabState: { tabs: WorkbenchTab[]; selectedTabId: string | null }) {
    setTabs(nextTabState.tabs);
    if (nextTabState.selectedTabId !== selectedTabIdRef.current) {
      resetStreamSequence();
    }
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
    resetStreamSequence();
    setSelectedTabId(tabId);
  }

  function handleCloseTab(tabId: string) {
    applyTabState(closeWorkbenchTab(tabsRef.current, selectedTabIdRef.current, tabId));
  }

  async function handleCreateSession() {
    setBusy(true);

    try {
      const created = await invoke<{ sessionId: string }>("create_local_session", {
        cols: 120,
        rows: 32
      });
      await refreshWorkbench({ ensureTab: createTerminalTab(created.sessionId) });
    } catch (error) {
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

  function handleOpenSettings() {
    setIsToolMenuOpen(false);
    applyTabState(openWorkbenchTab(tabsRef.current, selectedTabIdRef.current, SETTINGS_TAB));
  }

  function handleCheckForUpdates() {
    setIsToolMenuOpen(false);
    setToolMessage("Check for Updates is not wired up yet.");
  }

  function handleOpenAbout() {
    setIsToolMenuOpen(false);
    setIsAboutDialogOpen(true);
  }

  return (
    <>
      <main
        className={`workbench ${openSidebar ? "workbench-sidebar-open" : "workbench-sidebar-closed"}`}
        data-theme={settings.appearance.themePreset}
      >
        <ActivityRail
          isToolMenuOpen={isToolMenuOpen}
          onAbout={handleOpenAbout}
          onCheckForUpdates={handleCheckForUpdates}
          onOpenSidebarChange={setOpenSidebar}
          onSettings={handleOpenSettings}
          onToolMenuOpenChange={setIsToolMenuOpen}
          openSidebar={openSidebar}
        />

        {openSidebar ? (
          <SidebarHost
            busy={busy}
            onCreateSession={() => void handleCreateSession()}
            onRefresh={() => void refreshWorkbench()}
            onSelectSession={handleSelectSession}
            openSidebar={openSidebar}
            selectedSessionId={selectedSessionId}
            sessions={sessions}
          />
        ) : null}

        <WorkbenchMain
          activeTab={activeTab}
          onCloseTab={handleCloseTab}
          onResetSettingsGroup={handleResetSettingsGroup}
          onSelectSettingsGroup={setSelectedSettingsGroup}
          onSelectTab={handleSelectTab}
          onUpdateSettings={(next) => void handleUpdateSettings(next)}
          selectedSettingsGroup={selectedSettingsGroup}
          sessions={sessions}
          settings={settings}
          streamState={streamState}
          tabs={tabs}
          terminalHostRef={handleTerminalHostRef}
        />
        <UtilityPanelHost isVisible={false} />
      </main>

      {toolMessage ? (
        <div className="status-toast">
          <span>{toolMessage}</span>
          <button onClick={() => setToolMessage(null)} type="button">
            Dismiss
          </button>
        </div>
      ) : null}

      <AboutDialog isOpen={isAboutDialogOpen} onClose={() => setIsAboutDialogOpen(false)} />
    </>
  );
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

function decodePayload(payload: string) {
  const binary = window.atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function logDesktopError(error: unknown) {
  console.error(error);
}
