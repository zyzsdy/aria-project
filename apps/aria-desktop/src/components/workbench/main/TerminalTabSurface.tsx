import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  AttachViewerResponse,
  SessionMetadataDelta,
  SessionStreamFrame,
  SessionStreamMetadata
} from "@aria/types";
import { FitAddon } from "@xterm/addon-fit";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Terminal } from "@xterm/xterm";
import { defineMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/react";
import { applySettingsToTerminal } from "../../../settings/appSettings";
import { createTerminalOptions } from "../../../terminal/options";
import { activateUnicodeGraphemes } from "../../../terminal/unicode";
import { createDefaultWebglAddon } from "../../../terminal/webgl";
import {
  createTerminalStreamController,
  type StreamState
} from "./terminalStreamController";

const TERMINAL_TAB_SURFACE_MESSAGES = defineMessages({
  copy: {
    key: "common.actions.copy",
    defaultMessage: "Copy"
  },
  paste: {
    key: "common.actions.paste",
    defaultMessage: "Paste"
  },
  selectAll: {
    key: "common.actions.select_all",
    defaultMessage: "Select All"
  }
});

type TerminalTabSurfaceProps = {
  sessionId: string;
  isActive: boolean;
  settings: AppSettings;
  onStreamDetached: (sessionId: string) => void;
  onStreamError: (error: unknown) => void;
  onStreamMetadata: (sessionId: string, metadata: SessionStreamMetadata) => void;
  onStreamMetadataDelta: (sessionId: string, delta: SessionMetadataDelta) => void;
};

export function TerminalTabSurface({
  sessionId,
  isActive,
  settings,
  onStreamDetached,
  onStreamError,
  onStreamMetadata,
  onStreamMetadataDelta
}: TerminalTabSurfaceProps) {
  const t = useT();
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [streamState, setStreamState] = useState<StreamState>("detached");
  const [contextMenuState, setContextMenuState] = useState<{
    hasSelection: boolean;
    x: number;
    y: number;
  } | null>(null);

  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const controllerRef = useRef<ReturnType<typeof createTerminalStreamController> | null>(null);
  const settingsRef = useRef(settings);
  const streamCallbacksRef = useRef({
    onStreamDetached,
    onStreamError,
    onStreamMetadata,
    onStreamMetadataDelta
  });

  const handleHostRef = useCallback((node: HTMLDivElement | null) => {
    setHost(node);
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    streamCallbacksRef.current = {
      onStreamDetached,
      onStreamError,
      onStreamMetadata,
      onStreamMetadataDelta
    };
  }, [onStreamDetached, onStreamError, onStreamMetadata, onStreamMetadataDelta]);

  async function copyTerminalSelection() {
    const terminal = terminalRef.current;
    if (!terminal?.hasSelection() || !navigator.clipboard?.writeText) {
      return;
    }

    const selection = terminal.getSelection();
    if (!selection) {
      return;
    }

    await navigator.clipboard.writeText(selection);
    terminal.clearSelection();
  }

  async function pasteClipboardContents() {
    if (!navigator.clipboard?.readText) {
      return;
    }

    const text = await navigator.clipboard.readText();
    if (!text) {
      return;
    }

    await invoke("write_session", { sessionId, data: text });
  }

  async function runCopyAndPasteBehavior() {
    const terminal = terminalRef.current;
    if (terminal?.hasSelection()) {
      await copyTerminalSelection();
      return;
    }

    await pasteClipboardContents();
  }

  useEffect(() => {
    if (!host) {
      return;
    }

    const terminal = new Terminal(createTerminalOptions(settingsRef.current));
    applySettingsToTerminal(terminal, settingsRef.current);

    const fitAddon = new FitAddon();
    const webglAddon = createDefaultWebglAddon();
    terminal.loadAddon(fitAddon);
    activateUnicodeGraphemes(terminal);
    terminal.open(host);
    terminal.loadAddon(webglAddon);
    fitAddon.fit();

    const disposeData = terminal.onData((data: string) => {
      void invoke("write_session", { sessionId, data }).catch((error) => {
        streamCallbacksRef.current.onStreamError(error);
      });
    });

    const disposeResize = terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      void invoke("resize_session", { sessionId, cols, rows }).catch((error) => {
        streamCallbacksRef.current.onStreamError(error);
      });
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(host);

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();

      const terminal = terminalRef.current;
      if (settingsRef.current.terminal.rightClickBehavior === "menu") {
        setContextMenuState({
          hasSelection: terminal?.hasSelection() ?? false,
          x: event.clientX,
          y: event.clientY
        });
        return;
      }

      setContextMenuState(null);
      void runCopyAndPasteBehavior().catch(() => undefined);
    };
    host.addEventListener("contextmenu", handleContextMenu);

    const controller = createTerminalStreamController({
      sessionId,
      terminal,
      attachViewerStream: async ({ onFrame, replayFromSeq }) => {
        const channel = new Channel<SessionStreamFrame>((frame) => {
          onFrame(frame);
        });

        return invoke<AttachViewerResponse>("attach_session_stream", {
          sessionId,
          cols: terminal.cols || 80,
          rows: terminal.rows || 24,
          replayFromSeq,
          stream: channel
        });
      },
      detachViewer: async (viewerId) => {
        await invoke("detach_viewer", { viewerId });
      },
      acknowledgeViewer: async (viewerId, seq) => {
        await invoke("viewer_ack", { viewerId, seq });
      },
      onStreamStateChange: setStreamState,
      onStreamMetadata: (nextSessionId, metadata) => {
        streamCallbacksRef.current.onStreamMetadata(nextSessionId, metadata);
      },
      onStreamMetadataDelta: (nextSessionId, delta) => {
        streamCallbacksRef.current.onStreamMetadataDelta(nextSessionId, delta);
      },
      onStreamDetached: (nextSessionId) => {
        streamCallbacksRef.current.onStreamDetached(nextSessionId);
      },
      onError: (error) => {
        streamCallbacksRef.current.onStreamError(error);
      }
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    controllerRef.current = controller;

    void controller.mount();
    controller.setActive(isActive);
    if (isActive) {
      fitAddon.fit();
    }

    return () => {
      controllerRef.current = null;
      terminalRef.current = null;
      fitAddonRef.current = null;
      setContextMenuState(null);
      host.removeEventListener("contextmenu", handleContextMenu);
      resizeObserver.disconnect();
      disposeResize.dispose();
      disposeData.dispose();
      void controller.dispose();
      terminal.dispose();
    };
  }, [host, sessionId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    applySettingsToTerminal(terminal, settings);
    fitAddonRef.current?.fit();
  }, [settings]);

  useEffect(() => {
    controllerRef.current?.setActive(isActive);
    if (!isActive) {
      return;
    }
    fitAddonRef.current?.fit();
  }, [isActive]);

  useEffect(() => {
    if (!contextMenuState) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".terminal-context-menu")) {
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

  return (
    <section
      aria-hidden={!isActive}
      className="terminal-pane"
      data-stream-state={streamState}
      data-terminal-active={isActive}
    >
      <div ref={handleHostRef} className="terminal-surface" />
      {contextMenuState ? (
        <div
          className="app-menu terminal-context-menu"
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
            disabled={!contextMenuState.hasSelection}
            onClick={() => {
              void copyTerminalSelection().catch(() => undefined);
              setContextMenuState(null);
            }}
            role="menuitem"
            type="button"
          >
            <span>{t(TERMINAL_TAB_SURFACE_MESSAGES.copy)}</span>
          </button>
          <button
            className="app-menu-item"
            onClick={() => {
              void pasteClipboardContents().catch(() => undefined);
              setContextMenuState(null);
            }}
            role="menuitem"
            type="button"
          >
            <span>{t(TERMINAL_TAB_SURFACE_MESSAGES.paste)}</span>
          </button>
          <button
            className="app-menu-item"
            onClick={() => {
              terminalRef.current?.selectAll();
              setContextMenuState(null);
            }}
            role="menuitem"
            type="button"
          >
            <span>{t(TERMINAL_TAB_SURFACE_MESSAGES.selectAll)}</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
