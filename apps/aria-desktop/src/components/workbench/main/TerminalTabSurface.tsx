import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  AttachViewerResponse,
  SessionMetadataDelta,
  SessionStreamFrame,
  SessionStreamMetadata
} from "@aria/types";
import { FitAddon } from "@xterm/addon-fit";
import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { applySettingsToTerminal } from "../../../settings/appSettings";
import { createTerminalOptions } from "../../../terminal/options";
import { activateUnicodeGraphemes } from "../../../terminal/unicode";
import { createDefaultWebglAddon } from "../../../terminal/webgl";
import {
  createTerminalStreamController,
  type StreamState
} from "./terminalStreamController";

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
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [streamState, setStreamState] = useState<StreamState>("detached");

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
      if (settingsRef.current.terminal.rightClickBehavior === "menu") {
        return;
      }

      event.preventDefault();
      if (!navigator.clipboard?.readText) {
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

  return (
    <section
      aria-hidden={!isActive}
      className="terminal-pane"
      data-stream-state={streamState}
      data-terminal-active={isActive}
    >
      <div ref={handleHostRef} className="terminal-surface" />
    </section>
  );
}
