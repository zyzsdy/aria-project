// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AboutDialog } from "./AboutDialog";

const invokeMock = vi.fn();
const isTauriMock = vi.fn();

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  isTauri: () => isTauriMock()
}));

describe("AboutDialog", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    invokeMock.mockReset();
    isTauriMock.mockReset();
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
  });

  it("renders desktop version, author details, and hides WebView2 outside Tauri", async () => {
    isTauriMock.mockReturnValue(false);
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "daemon_health") {
        return {
          status: "ready",
          message: "ready",
          daemon: null,
          app: {
            name: "Aria Core",
            version: "0.1.0",
            buildTime: null,
            platform: "windows"
          }
        };
      }

      throw new Error(`unexpected command: ${command}`);
    });

    await renderDialog();

    expect(container?.textContent).toContain("Aria Terminal");
    expect(container?.textContent).toContain("Aria Desktop version: 0.1.0");
    expect(container?.textContent).not.toContain("Webview2 version:");
    expect(container?.textContent).toContain("Aria Core version: 0.1.0");
    expect(container?.textContent).toContain("Author: Zyzsdy");
    expect(container?.querySelector('a[href="https://github.com/zyzsdy/aria-project"]')).not.toBeNull();
    expect(container?.textContent).toContain("Close");
  });

  it("shows the WebView2 version inside Tauri", async () => {
    isTauriMock.mockReturnValue(true);
    invokeMock.mockImplementation(async (command: string) => {
      if (command === "daemon_health") {
        return {
          status: "ready",
          message: "ready",
          daemon: null,
          app: {
            name: "Aria Core",
            version: "0.1.0",
            buildTime: null,
            platform: "windows"
          }
        };
      }

      if (command === "get_about_runtime_info") {
        return { webviewVersion: "146.0.0.0" };
      }

      throw new Error(`unexpected command: ${command}`);
    });

    await renderDialog();

    expect(container?.textContent).toContain("Webview2 version: 146.0.0.0");
  });

  it("shows a not connected message when aria core is unavailable", async () => {
    isTauriMock.mockReturnValue(false);
    invokeMock.mockRejectedValue(new Error("offline"));

    await renderDialog();

    expect(container?.textContent).toContain("Aria Core not connected");
  });

  async function renderDialog() {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(<AboutDialog isOpen={true} onClose={() => undefined} />);
      await Promise.resolve();
      await Promise.resolve();
    });
  }
});
