// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@aria/types";
import { createPlatformDefaultSettings } from "./settings/appSettings";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn()
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

vi.mock("./components/workbench/main/TerminalTabSurface", () => ({
  TerminalTabSurface: () => null
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

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => ({
    fillRect() {},
    createLinearGradient() {
      return {
        addColorStop() {}
      };
    },
    getImageData() {
      return {
        data: new Uint8ClampedArray(4)
      };
    }
  })
});

describe("App", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let AppComponent: typeof import("./App").App;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(async () => {
    invokeMock.mockReset();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    AppComponent = (await import("./App")).App;
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
    }

    container?.remove();
    container = null;
    root = null;
    consoleErrorSpy?.mockRestore();
    consoleErrorSpy = null;
  });

  it("shows a modal when launching a configured shell profile fails", async () => {
    const settings = createPlatformDefaultSettings("windows");
    const brokenProfile = {
      id: "custom:broken",
      source: "custom" as const,
      name: "Broken Shell",
      executable: "missing-shell.exe",
      args: ["--bad"],
      startupDir: "C:/missing"
    };

    invokeMock.mockImplementation(async (command: string, payload?: Record<string, unknown>) => {
      switch (command) {
        case "get_app_settings":
          return {
            ...settings,
            profiles: {
              ...settings.profiles,
              items: [...settings.profiles.items, brokenProfile]
            }
          };
        case "list_sessions":
          return [];
        case "create_local_session":
          expect(payload).toEqual({
            cols: 120,
            rows: 32,
            profileId: "custom:broken"
          });
          throw "spawn PTY command [\"missing-shell.exe\", \"--bad\"]: The system cannot find the file specified. (os error 2)";
        default:
          throw new Error(`Unexpected invoke command: ${command}`);
      }
    });

    renderApp();
    await flushAsyncWork();

    const menuButton = await waitForButton("Open shell profiles");
    act(() => {
      menuButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    const profileButton = await waitForButton("Broken Shell");
    act(() => {
      profileButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    const dialog = container?.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Unable to create session");
    expect(dialog?.textContent).toContain(
      "spawn PTY command [\"missing-shell.exe\", \"--bad\"]"
    );
  });

  it("removes a terminated sidebar session and its tab before close_session resolves", async () => {
    const settings = createPlatformDefaultSettings("windows");
    const session = createSessionSummary("session-a", "Alpha");
    let sessions: SessionSummary[] = [session];
    let resolveCloseSession: () => void = () => undefined;
    const closeSessionPromise = new Promise<void>((resolve) => {
      resolveCloseSession = resolve;
    });

    invokeMock.mockImplementation(async (command: string, payload?: Record<string, unknown>) => {
      switch (command) {
        case "get_app_settings":
          return settings;
        case "list_sessions":
          return sessions;
        case "close_session":
          expect(payload).toEqual({ sessionId: "session-a" });
          return closeSessionPromise;
        default:
          throw new Error(`Unexpected invoke command: ${command}`);
      }
    });

    renderApp();
    await waitForElement(".sidebar-tree-row");
    expect(container?.textContent).toContain("Alpha");

    act(() => {
      container
        ?.querySelector(".sidebar-tree-row")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    await flushAsyncWork();

    const terminateButton = await waitForButton("Terminate");
    act(() => {
      terminateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(invokeMock).toHaveBeenCalledWith("close_session", { sessionId: "session-a" });
    expect(container?.querySelector(".sidebar-tree-row")).toBeNull();
    expect(container?.textContent).not.toContain("Alpha");

    sessions = [];
    resolveCloseSession();
    await flushAsyncWork();

    expect(invokeMock.mock.calls.filter(([command]) => command === "close_session")).toHaveLength(
      1
    );
    expect(container?.textContent).not.toContain("Alpha");
  });

  function renderApp() {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(<AppComponent />);
    });
  }

  async function waitForButton(label: string) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const button = [...(container?.querySelectorAll("button") ?? [])].find((candidate) => {
        const ariaLabel = candidate.getAttribute("aria-label");
        return ariaLabel === label || candidate.textContent?.includes(label);
      });

      if (button instanceof HTMLButtonElement) {
        return button;
      }

      await flushAsyncWork();
    }

    throw new Error(`Unable to find button: ${label}`);
  }

  async function waitForElement(selector: string) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const element = container?.querySelector(selector);
      if (element) {
        return element;
      }

      await flushAsyncWork();
    }

    throw new Error(`Unable to find element: ${selector}`);
  }

  async function flushAsyncWork() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await act(async () => {
        await Promise.resolve();
      });
    }
  }
});

function createSessionSummary(sessionId: string, title: string): SessionSummary {
  return {
    sessionId,
    title,
    status: "running",
    transport: "local_pty",
    size: {
      cols: 120,
      rows: 32,
      pixelWidth: 0,
      pixelHeight: 0
    },
    createdAt: "1",
    updatedAt: "1"
  };
}
