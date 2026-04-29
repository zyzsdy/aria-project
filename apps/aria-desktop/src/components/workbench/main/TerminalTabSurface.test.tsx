// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlatformDefaultSettings } from "../../../settings/appSettings";

const testState = vi.hoisted(() => {
  const invokeMock = vi.fn();
  const activateUnicodeMock = vi.fn();
  const createWebglAddonMock = vi.fn(() => ({ dispose: vi.fn() }));
  const controller = {
    mount: vi.fn(async () => undefined),
    setActive: vi.fn(),
    dispose: vi.fn(async () => undefined)
  };
  const createControllerMock = vi.fn(() => controller);
  const fitMock = vi.fn();
  const terminalInstances: MockTerminal[] = [];

  class MockTerminal {
    cols = 80;
    rows = 24;
    options: Record<string, unknown>;
    selectionText = "";
    openHost: HTMLElement | null = null;
    selectAll = vi.fn(() => {
      this.selectionText = "all";
    });
    clearSelection = vi.fn(() => {
      this.selectionText = "";
    });
    focus = vi.fn();
    blur = vi.fn();
    dispose = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = { ...options };
      terminalInstances.push(this);
    }

    loadAddon(_addon: unknown) {}

    open(host: HTMLElement) {
      this.openHost = host;
    }

    onData(_listener: (data: string) => void) {
      return {
        dispose() {}
      };
    }

    onResize(_listener: (size: { cols: number; rows: number }) => void) {
      return {
        dispose() {}
      };
    }

    hasSelection() {
      return this.selectionText.length > 0;
    }

    getSelection() {
      return this.selectionText;
    }
  }

  class MockFitAddon {
    fit = fitMock;
  }

  return {
    MockFitAddon,
    MockTerminal,
    activateUnicodeMock,
    controller,
    createControllerMock,
    createWebglAddonMock,
    fitMock,
    invokeMock,
    terminalInstances
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    constructor(_listener: unknown) {}
  },
  invoke: testState.invokeMock
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: testState.MockFitAddon
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: testState.MockTerminal
}));

vi.mock("../../../terminal/unicode", () => ({
  activateUnicodeGraphemes: testState.activateUnicodeMock
}));

vi.mock("../../../terminal/webgl", () => ({
  createDefaultWebglAddon: testState.createWebglAddonMock
}));

vi.mock("./terminalStreamController", () => ({
  createTerminalStreamController: testState.createControllerMock
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

class ResizeObserverStub {
  observe() {}

  disconnect() {}

  unobserve() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  writable: true,
  value: ResizeObserverStub
});

describe("TerminalTabSurface", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let readTextMock: ReturnType<typeof vi.fn>;
  let writeTextMock: ReturnType<typeof vi.fn>;
  let TerminalTabSurfaceComponent: typeof import("./TerminalTabSurface").TerminalTabSurface;

  beforeEach(async () => {
    testState.invokeMock.mockReset();
    testState.activateUnicodeMock.mockReset();
    testState.createWebglAddonMock.mockClear();
    testState.createControllerMock.mockClear();
    testState.controller.mount.mockClear();
    testState.controller.setActive.mockClear();
    testState.controller.dispose.mockClear();
    testState.fitMock.mockClear();
    testState.terminalInstances.length = 0;

    readTextMock = vi.fn(async () => "");
    writeTextMock = vi.fn(async () => undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      value: {
        readText: readTextMock,
        writeText: writeTextMock
      }
    });

    TerminalTabSurfaceComponent = (await import("./TerminalTabSurface")).TerminalTabSurface;
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
    }

    container?.remove();
    container = null;
    root = null;
  });

  it("opens a custom terminal menu, disables copy without a selection, and handles select all", async () => {
    renderSurface({
      terminal: {
        ...createPlatformDefaultSettings("windows").terminal,
        rightClickBehavior: "menu"
      }
    });
    await flushAsyncWork();

    const terminalHost = findTerminalHost();
    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 48,
      clientY: 96
    });

    act(() => {
      terminalHost.dispatchEvent(contextMenuEvent);
    });

    expect(contextMenuEvent.defaultPrevented).toBe(true);

    const copyButton = findButton("Copy");
    const pasteButton = findButton("Paste");
    const selectAllButton = findButton("Select All");

    expect(copyButton).not.toBeNull();
    expect(copyButton?.disabled).toBe(true);
    expect(pasteButton).not.toBeNull();
    expect(selectAllButton).not.toBeNull();

    act(() => {
      selectAllButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(lastTerminal().selectAll).toHaveBeenCalledTimes(1);
    expect(container?.querySelector(".terminal-context-menu")).toBeNull();
  });

  it("copies the current terminal selection from the custom menu", async () => {
    renderSurface({
      terminal: {
        ...createPlatformDefaultSettings("windows").terminal,
        rightClickBehavior: "menu"
      }
    });
    await flushAsyncWork();

    lastTerminal().selectionText = "Get-ChildItem";

    act(() => {
      findTerminalHost().dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 20,
          clientY: 24
        })
      );
    });

    act(() => {
      findButton("Copy")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(writeTextMock).toHaveBeenCalledWith("Get-ChildItem");
    expect(lastTerminal().clearSelection).toHaveBeenCalledTimes(1);
    expect(lastTerminal().selectionText).toBe("");
    expect(container?.querySelector(".terminal-context-menu")).toBeNull();
  });

  it("copies selected text when right click is set to copy and paste", async () => {
    renderSurface();
    await flushAsyncWork();

    lastTerminal().selectionText = "echo hi";
    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 32
    });

    act(() => {
      findTerminalHost().dispatchEvent(contextMenuEvent);
    });
    await flushAsyncWork();

    expect(contextMenuEvent.defaultPrevented).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith("echo hi");
    expect(lastTerminal().clearSelection).toHaveBeenCalledTimes(1);
    expect(lastTerminal().selectionText).toBe("");
    expect(readTextMock).not.toHaveBeenCalled();
    expect(testState.invokeMock).not.toHaveBeenCalledWith("write_session", expect.anything());
  });

  it("pastes clipboard text when right click is set to copy and paste without a selection", async () => {
    readTextMock.mockResolvedValueOnce("dir\r");

    renderSurface();
    await flushAsyncWork();

    const contextMenuEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 16,
      clientY: 40
    });

    act(() => {
      findTerminalHost().dispatchEvent(contextMenuEvent);
    });
    await flushAsyncWork();

    expect(contextMenuEvent.defaultPrevented).toBe(true);
    expect(readTextMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock).not.toHaveBeenCalled();
    expect(testState.invokeMock).toHaveBeenCalledWith("write_session", {
      data: "dir\r",
      sessionId: "session-a"
    });
  });

  function renderSurface(settingsOverride?: Partial<ReturnType<typeof createPlatformDefaultSettings>>) {
    const settings = {
      ...createPlatformDefaultSettings("windows"),
      ...settingsOverride,
      appearance: {
        ...createPlatformDefaultSettings("windows").appearance,
        ...settingsOverride?.appearance
      },
      terminal: {
        ...createPlatformDefaultSettings("windows").terminal,
        ...settingsOverride?.terminal
      },
      workspace: {
        ...createPlatformDefaultSettings("windows").workspace,
        ...settingsOverride?.workspace
      },
      localization: {
        ...createPlatformDefaultSettings("windows").localization,
        ...settingsOverride?.localization
      },
      profiles: {
        ...createPlatformDefaultSettings("windows").profiles,
        ...settingsOverride?.profiles
      }
    };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <TerminalTabSurfaceComponent
          isActive={true}
          onStreamDetached={() => undefined}
          onStreamError={() => undefined}
          onStreamMetadata={() => undefined}
          onStreamMetadataDelta={() => undefined}
          sessionId="session-a"
          settings={settings}
        />
      );
    });
  }

  function findTerminalHost() {
    const host = container?.querySelector(".terminal-surface");
    if (!(host instanceof HTMLDivElement)) {
      throw new Error("expected terminal surface host to exist");
    }

    return host;
  }

  function findButton(label: string) {
    return (
      Array.from(container?.querySelectorAll("button") ?? []).find((candidate) =>
        candidate.textContent?.includes(label)
      ) ?? null
    );
  }

  function lastTerminal() {
    const terminal = testState.terminalInstances[testState.terminalInstances.length - 1];
    if (!terminal) {
      throw new Error("expected a terminal instance to be created");
    }

    return terminal;
  }

  async function flushAsyncWork() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }
});
