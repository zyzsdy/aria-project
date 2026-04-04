import { Channel, invoke } from "@tauri-apps/api/core";
import {
  type AttachViewerResponse,
  type SessionMetadataDelta,
  type SessionStreamFrame,
  type SessionStreamMetadata,
  type SessionSummary
} from "@aria/types";
import { CanvasAddon } from "@xterm/addon-canvas";
import { FitAddon } from "@xterm/addon-fit";
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { ActivityRail } from "./components/workbench/ActivityRail";
import { WorkbenchMain } from "./components/workbench/main/WorkbenchMain";
import { SidebarHost } from "./components/workbench/sidebar/SidebarHost";
import type { SidebarPanel } from "./components/workbench/sidebar/sidebarState";
import {
  closeSessionTab,
  openSessionTab,
  reconcileOpenTabs,
  type TabState
} from "./components/workbench/main/tabState";
import { UtilityPanelHost } from "./components/workbench/utility/UtilityPanelHost";

type StreamState = "detached" | "attaching" | "attached" | "reconnecting";
type ThemePreset = "north" | "oxide" | "forest";

type TerminalTheme = {
  background: string;
  foreground: string;
  cursor: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

const DEFAULT_FONT_FAMILY = "Cascadia Mono";
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_THEME_PRESET: ThemePreset = "north";

const TERMINAL_THEMES: Record<ThemePreset, TerminalTheme> = {
  north: {
    background: "#05080d",
    foreground: "#dce8f7",
    cursor: "#7ac2ff",
    selectionBackground: "#28405d99",
    black: "#1a2029",
    red: "#dd7b7b",
    green: "#7ecf9a",
    yellow: "#d8b56b",
    blue: "#6aa9ff",
    magenta: "#b999ff",
    cyan: "#6fd3d7",
    white: "#dce8f7",
    brightBlack: "#556170",
    brightRed: "#ff9f9f",
    brightGreen: "#9bf0b7",
    brightYellow: "#efca7d",
    brightBlue: "#8bc0ff",
    brightMagenta: "#cfb7ff",
    brightCyan: "#92e8ea",
    brightWhite: "#ffffff"
  },
  oxide: {
    background: "#0a0c10",
    foreground: "#e6e1d8",
    cursor: "#f1a75f",
    selectionBackground: "#61442888",
    black: "#1f1e1b",
    red: "#d87572",
    green: "#8fbe77",
    yellow: "#d4bc72",
    blue: "#7ea9cf",
    magenta: "#b89fd9",
    cyan: "#7cc3bd",
    white: "#e6e1d8",
    brightBlack: "#656158",
    brightRed: "#f59d99",
    brightGreen: "#acd88c",
    brightYellow: "#efd08b",
    brightBlue: "#9cc5ea",
    brightMagenta: "#cfb7ef",
    brightCyan: "#9ce0d9",
    brightWhite: "#fff9ef"
  },
  forest: {
    background: "#07100c",
    foreground: "#dae7dd",
    cursor: "#6fd1a0",
    selectionBackground: "#1f4f3c99",
    black: "#17201c",
    red: "#d98282",
    green: "#75cb90",
    yellow: "#d8c07a",
    blue: "#7caed4",
    magenta: "#b7a0da",
    cyan: "#72d2c1",
    white: "#dae7dd",
    brightBlack: "#56665f",
    brightRed: "#eea3a3",
    brightGreen: "#96e2af",
    brightYellow: "#ecd28f",
    brightBlue: "#98c7ec",
    brightMagenta: "#d0bbee",
    brightCyan: "#8ae9d7",
    brightWhite: "#fbfff9"
  }
};

export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [openTabSessionIds, setOpenTabSessionIds] = useState<string[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<StreamState>("detached");
  const [busy, setBusy] = useState(false);
  const [openSidebar, setOpenSidebar] = useState<SidebarPanel | null>("sessions");
  const [terminalHost, setTerminalHost] = useState<HTMLDivElement | null>(null);
  const [terminalReady, setTerminalReady] = useState(false);
  const [streamRevision, setStreamRevision] = useState(0);

  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const selectedSessionIdRef = useRef<string | null>(null);
  const openTabSessionIdsRef = useRef<string[]>([]);
  const scheduledSeqRef = useRef(0);
  const appliedSeqRef = useRef(0);
  const handleTerminalHostRef = useCallback((node: HTMLDivElement | null) => {
    setTerminalHost(node);
  }, []);

  useEffect(() => {
    activeSessionIdRef.current = selectedSessionId;
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    openTabSessionIdsRef.current = openTabSessionIds;
  }, [openTabSessionIds]);

  useEffect(() => {
    void refreshWorkbench();
  }, []);

  useEffect(() => {
    if (!terminalHost) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      allowProposedApi: false,
      fontFamily: DEFAULT_FONT_FAMILY,
      fontSize: DEFAULT_FONT_SIZE,
      theme: TERMINAL_THEMES[DEFAULT_THEME_PRESET],
      scrollback: 2000
    });
    const fitAddon = new FitAddon();
    const canvasAddon = new CanvasAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(canvasAddon);
    terminal.open(terminalHost);
    fitAddon.fit();

    const disposeData = terminal.onData((data: string) => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) {
        return;
      }
      void invoke("write_session", { sessionId, data }).catch(logDesktopError);
    });

    const disposeResize = terminal.onResize(
      ({ cols, rows }: { cols: number; rows: number }) => {
        const sessionId = activeSessionIdRef.current;
        if (!sessionId) {
          return;
        }
        void invoke("resize_session", { sessionId, cols, rows }).catch(logDesktopError);
      }
    );

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminalHost);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    setTerminalReady(true);

    return () => {
      setTerminalReady(false);
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
          setSessions((current) =>
            patchSessionDelta(current, frame.sessionId, frame.metadata)
          );
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

  function applyTabState(nextTabState: TabState) {
    setOpenTabSessionIds(nextTabState.openTabSessionIds);
    if (nextTabState.selectedSessionId !== selectedSessionIdRef.current) {
      resetStreamSequence();
    }
    setSelectedSessionId(nextTabState.selectedSessionId);
  }

  async function refreshWorkbench(options?: { ensureOpenSessionId?: string }) {
    setBusy(true);

    try {
      const nextSessions = await invoke<SessionSummary[]>("list_sessions");
      const availableSessionIds = nextSessions.map((session) => session.sessionId);
      const nextTabState = reconcileOpenTabs(
        options?.ensureOpenSessionId
          ? openSessionTab(
              openTabSessionIdsRef.current,
              selectedSessionIdRef.current,
              options.ensureOpenSessionId
            ).openTabSessionIds
          : openTabSessionIdsRef.current,
        options?.ensureOpenSessionId ?? selectedSessionIdRef.current,
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
      openSessionTab(openTabSessionIdsRef.current, selectedSessionIdRef.current, sessionId)
    );
  }

  function handleSelectTab(sessionId: string) {
    if (sessionId === selectedSessionIdRef.current) {
      return;
    }
    resetStreamSequence();
    setSelectedSessionId(sessionId);
  }

  function handleCloseTab(sessionId: string) {
    applyTabState(
      closeSessionTab(openTabSessionIdsRef.current, selectedSessionIdRef.current, sessionId)
    );
  }

  async function handleCreateSession() {
    setBusy(true);

    try {
      const created = await invoke<{ sessionId: string }>("create_local_session", {
        cols: 120,
        rows: 32
      });
      await refreshWorkbench({ ensureOpenSessionId: created.sessionId });
    } catch (error) {
      logDesktopError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      className={`workbench ${openSidebar ? "workbench-sidebar-open" : "workbench-sidebar-closed"}`}
      data-theme={DEFAULT_THEME_PRESET}
    >
      <ActivityRail
        onOpenSidebarChange={setOpenSidebar}
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
        onCloseTab={handleCloseTab}
        onSelectTab={handleSelectTab}
        openTabSessionIds={openTabSessionIds}
        selectedSessionId={selectedSessionId}
        sessions={sessions}
        streamState={streamState}
        terminalHostRef={handleTerminalHostRef}
      />
      <UtilityPanelHost isVisible={false} />
    </main>
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
