import type {
  AttachViewerResponse,
  SessionMetadataDelta,
  SessionStreamFrame,
  SessionStreamMetadata
} from "@aria/types";

export type StreamState = "detached" | "attaching" | "attached" | "reconnecting";

export type TerminalStreamTerminal = {
  cols: number;
  rows: number;
  reset: () => void;
  clear: () => void;
  write: (data: Uint8Array, callback?: () => void) => void;
  focus: () => void;
  blur?: () => void;
};

type AttachViewerStreamArgs = {
  sessionId: string;
  cols: number;
  rows: number;
  replayFromSeq?: number;
  onFrame: (frame: SessionStreamFrame) => void;
};

type CreateTerminalStreamControllerOptions = {
  sessionId: string;
  terminal: TerminalStreamTerminal;
  attachViewerStream: (
    args: AttachViewerStreamArgs
  ) => Promise<Pick<AttachViewerResponse, "viewerId">>;
  detachViewer: (viewerId: string) => Promise<void>;
  acknowledgeViewer: (viewerId: string, seq: number) => Promise<void>;
  onStreamStateChange: (state: StreamState) => void;
  onStreamMetadata: (sessionId: string, metadata: SessionStreamMetadata) => void;
  onStreamMetadataDelta: (sessionId: string, delta: SessionMetadataDelta) => void;
  onStreamDetached: (sessionId: string) => void;
  onError: (error: unknown) => void;
};

export function createTerminalStreamController({
  sessionId,
  terminal,
  attachViewerStream,
  detachViewer,
  acknowledgeViewer,
  onStreamStateChange,
  onStreamMetadata,
  onStreamMetadataDelta,
  onStreamDetached,
  onError
}: CreateTerminalStreamControllerOptions) {
  let streamState: StreamState = "detached";
  let viewerId: string | null = null;
  let mounted = false;
  let disposed = false;
  let isActive = false;
  let connectRevision = 0;
  let scheduledSeq = 0;
  let appliedSeq = 0;
  let reconnectPromise: Promise<void> | null = null;

  const setStreamState = (nextState: StreamState) => {
    if (streamState === nextState) {
      return;
    }
    streamState = nextState;
    onStreamStateChange(nextState);
  };

  const acknowledge = (frameViewerId: string, seq: number) => {
    appliedSeq = seq;
    void acknowledgeViewer(frameViewerId, seq).catch(() => undefined);
  };

  const applyFrame = (frame: SessionStreamFrame) => {
    const expected = scheduledSeq === 0 ? frame.seq : scheduledSeq + 1;
    if (frame.seq !== expected) {
      void reconnect();
      return;
    }
    scheduledSeq = frame.seq;

    if (frame.type === "terminal.rehydrate") {
      terminal.reset();
      terminal.clear();
      terminal.write(decodePayload(frame.vtPayload), () => {
        acknowledge(frame.viewerId, frame.seq);
      });
      onStreamMetadata(frame.sessionId, frame.metadata);
      return;
    }

    if (frame.type === "terminal.bytes") {
      terminal.write(decodePayload(frame.bytes), () => {
        acknowledge(frame.viewerId, frame.seq);
      });
      return;
    }

    if (frame.type === "session.metadata") {
      onStreamMetadataDelta(frame.sessionId, frame.metadata);
      acknowledge(frame.viewerId, frame.seq);
      return;
    }

    setStreamState("detached");
    acknowledge(frame.viewerId, frame.seq);
    onStreamDetached(frame.sessionId);
  };

  const connect = async (replayFromSeq?: number) => {
    const revision = ++connectRevision;
    const isReconnect = typeof replayFromSeq === "number" && replayFromSeq > 0;
    setStreamState(isReconnect ? "reconnecting" : "attaching");

    if (!isReconnect) {
      terminal.reset();
      terminal.clear();
    }

    try {
      const response = await attachViewerStream({
        sessionId,
        cols: terminal.cols || 80,
        rows: terminal.rows || 24,
        replayFromSeq,
        onFrame: (frame) => {
          if (disposed || revision !== connectRevision) {
            return;
          }
          applyFrame(frame);
        }
      });

      if (disposed || revision !== connectRevision) {
        await detachViewer(response.viewerId).catch(() => undefined);
        return;
      }

      viewerId = response.viewerId;
      setStreamState("attached");
    } catch (error) {
      if (disposed || revision !== connectRevision) {
        return;
      }
      onError(error);
      setStreamState("detached");
    }
  };

  const reconnect = async () => {
    if (disposed || reconnectPromise) {
      return reconnectPromise ?? Promise.resolve();
    }

    reconnectPromise = (async () => {
      const nextReplayFromSeq = appliedSeq || undefined;
      const currentViewerId = viewerId;
      viewerId = null;
      scheduledSeq = appliedSeq;

      if (currentViewerId) {
        await detachViewer(currentViewerId).catch(() => undefined);
      }

      if (!disposed) {
        await connect(nextReplayFromSeq);
      }
    })().finally(() => {
      reconnectPromise = null;
    });

    return reconnectPromise;
  };

  return {
    async mount() {
      if (mounted || disposed) {
        return;
      }
      mounted = true;
      await connect();
    },
    setActive(nextIsActive: boolean) {
      if (disposed || isActive === nextIsActive) {
        return;
      }
      isActive = nextIsActive;
      if (nextIsActive) {
        terminal.focus();
        return;
      }
      terminal.blur?.();
    },
    async dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      connectRevision += 1;
      const currentViewerId = viewerId;
      viewerId = null;
      setStreamState("detached");
      if (!currentViewerId) {
        return;
      }
      await detachViewer(currentViewerId).catch(() => undefined);
    }
  };
}

function decodePayload(payload: string) {
  const binary = globalThis.atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
