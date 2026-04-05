import type {
  AttachViewerResponse,
  SessionMetadataDelta,
  SessionStreamFrame,
  SessionStreamMetadata
} from "@aria/types";
import { describe, expect, it, vi } from "vitest";
import {
  createTerminalStreamController,
  type StreamState,
  type TerminalStreamTerminal
} from "./terminalStreamController";

function createTerminal(): TerminalStreamTerminal {
  return {
    cols: 80,
    rows: 24,
    clear: vi.fn(),
    reset: vi.fn(),
    write: vi.fn((_data: Uint8Array, callback?: () => void) => {
      callback?.();
    }),
    focus: vi.fn(),
    blur: vi.fn()
  };
}

function createAttachViewerResponse(viewerId: string): AttachViewerResponse {
  return {
    viewerId,
    sessionId: "session-a",
    acceptedRole: "interactive",
    replayMode: "rehydrate",
    nextExpectedSeq: 1
  };
}

function createController(options?: {
  attachViewerStream?: ReturnType<typeof vi.fn>;
  detachViewer?: ReturnType<typeof vi.fn>;
  acknowledgeViewer?: ReturnType<typeof vi.fn>;
  onStreamStateChange?: (state: StreamState) => void;
  onStreamMetadata?: (sessionId: string, metadata: SessionStreamMetadata) => void;
  onStreamMetadataDelta?: (sessionId: string, delta: SessionMetadataDelta) => void;
  onStreamDetached?: (sessionId: string) => void;
}) {
  const terminal = createTerminal();
  const attachViewerStream =
    options?.attachViewerStream ??
    vi.fn(async () => {
      return createAttachViewerResponse("viewer-1");
    });
  const detachViewer =
    options?.detachViewer ??
    vi.fn(async () => {
      return undefined;
    });
  const acknowledgeViewer =
    options?.acknowledgeViewer ??
    vi.fn(async () => {
      return undefined;
    });

  const controller = createTerminalStreamController({
    sessionId: "session-a",
    terminal,
    attachViewerStream,
    detachViewer,
    acknowledgeViewer,
    onStreamStateChange: options?.onStreamStateChange ?? (() => undefined),
    onStreamMetadata: options?.onStreamMetadata ?? (() => undefined),
    onStreamMetadataDelta: options?.onStreamMetadataDelta ?? (() => undefined),
    onStreamDetached: options?.onStreamDetached ?? (() => undefined),
    onError: () => undefined
  });

  return {
    terminal,
    controller,
    attachViewerStream,
    detachViewer,
    acknowledgeViewer
  };
}

describe("createTerminalStreamController", () => {
  it("attaches only once while the tab stays open across visibility toggles", async () => {
    const streamStates: StreamState[] = [];
    const { controller, attachViewerStream, detachViewer, terminal } = createController({
      onStreamStateChange: (state) => {
        streamStates.push(state);
      }
    });

    await controller.mount();
    controller.setActive(true);
    controller.setActive(false);
    controller.setActive(true);

    expect(attachViewerStream).toHaveBeenCalledTimes(1);
    expect(detachViewer).not.toHaveBeenCalled();
    expect(terminal.blur).toHaveBeenCalledTimes(1);
    expect(terminal.focus).toHaveBeenCalledTimes(2);
    expect(streamStates).toEqual(["attaching", "attached"]);
  });

  it("detaches on dispose and only reattaches after a new controller is created", async () => {
    const attachViewerStream = vi
      .fn<() => Promise<AttachViewerResponse>>()
      .mockResolvedValueOnce(createAttachViewerResponse("viewer-1"))
      .mockResolvedValueOnce(createAttachViewerResponse("viewer-2"));
    const detachViewer = vi.fn(async () => undefined);

    const first = createController({ attachViewerStream, detachViewer });
    await first.controller.mount();
    await first.controller.dispose();

    const second = createController({ attachViewerStream, detachViewer });
    await second.controller.mount();

    expect(attachViewerStream).toHaveBeenCalledTimes(2);
    expect(detachViewer).toHaveBeenCalledTimes(1);
    expect(detachViewer).toHaveBeenCalledWith("viewer-1");
  });

  it("forwards stream metadata and detachment events to app callbacks", async () => {
    let emitFrame: ((frame: SessionStreamFrame) => void) | null = null;
    const onStreamMetadata = vi.fn();
    const onStreamMetadataDelta = vi.fn();
    const onStreamDetached = vi.fn();
    const acknowledgeViewer = vi.fn(async () => undefined);

    const { controller } = createController({
      attachViewerStream: vi.fn(async ({ onFrame }) => {
        emitFrame = onFrame;
        return createAttachViewerResponse("viewer-1");
      }),
      acknowledgeViewer,
      onStreamMetadata,
      onStreamMetadataDelta,
      onStreamDetached
    });

    await controller.mount();

    const dispatchFrame = (frame: SessionStreamFrame) => {
      if (!emitFrame) {
        throw new Error("expected stream frame callback to be registered");
      }
      emitFrame(frame);
    };

    dispatchFrame({
      type: "terminal.rehydrate",
      seq: 1,
      sessionId: "session-a",
      viewerId: "viewer-1",
      reason: "attach",
      activeBuffer: "primary",
      size: { cols: 80, rows: 24, pixelWidth: 0, pixelHeight: 0 },
      payloadEncoding: "base64",
      vtPayload: "aGVsbG8=",
      metadata: {
        title: "PowerShell",
        status: "running",
        cwd: null,
        shell: "powershell.exe",
        processId: 42,
        exitCode: null
      }
    });
    dispatchFrame({
      type: "session.metadata",
      seq: 2,
      sessionId: "session-a",
      viewerId: "viewer-1",
      metadata: {
        title: "build",
        status: "running",
        cwd: undefined,
        shell: undefined,
        processId: undefined,
        exitCode: undefined
      }
    });
    dispatchFrame({
      type: "viewer.detached",
      seq: 3,
      sessionId: "session-a",
      viewerId: "viewer-1",
      reason: "session-closed"
    });

    expect(onStreamMetadata).toHaveBeenCalledWith("session-a", {
      title: "PowerShell",
      status: "running",
      cwd: null,
      shell: "powershell.exe",
      processId: 42,
      exitCode: null
    });
    expect(onStreamMetadataDelta).toHaveBeenCalledWith("session-a", {
      title: "build",
      status: "running",
      cwd: undefined,
      shell: undefined,
      processId: undefined,
      exitCode: undefined
    });
    expect(onStreamDetached).toHaveBeenCalledWith("session-a");
    expect(acknowledgeViewer).toHaveBeenCalledTimes(3);
  });
});
