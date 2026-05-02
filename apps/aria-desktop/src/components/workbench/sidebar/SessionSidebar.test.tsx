// @vitest-environment jsdom

import type { SessionStatus, SessionSummary } from "@aria/types";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionSidebar } from "./SessionSidebar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("SessionSidebar", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
    }
    container?.remove();
    container = null;
    root = null;
  });

  it("shows the background toggle between rename and terminate for running sessions", () => {
    const onSetSessionBackground = vi.fn();
    renderSidebar({
      onSetSessionBackground,
      sessions: [createSessionSummary("session-a", "Alpha", "running")]
    });

    openContextMenu();
    const menuItems = menuItemLabels();

    expect(menuItems).toEqual(["Rename", "Run in background", "Terminate"]);
    clickButton("Run in background");
    expect(onSetSessionBackground).toHaveBeenCalledWith("session-a", true);
  });

  it("shows a foreground toggle for background sessions", () => {
    const onSetSessionBackground = vi.fn();
    renderSidebar({
      onSetSessionBackground,
      sessions: [createSessionSummary("session-a", "Alpha", "background")]
    });

    openContextMenu();

    expect(menuItemLabels()).toEqual(["Rename", "Bring to foreground", "Terminate"]);
    expect(container?.querySelector(".session-dot-background")).not.toBeNull();
    clickButton("Bring to foreground");
    expect(onSetSessionBackground).toHaveBeenCalledWith("session-a", false);
  });

  it("disables the background toggle for non-running sessions", () => {
    const onSetSessionBackground = vi.fn();
    renderSidebar({
      onSetSessionBackground,
      sessions: [createSessionSummary("session-a", "Alpha", "exited")]
    });

    openContextMenu();
    const toggle = findButton("Run in background");

    expect(toggle.disabled).toBe(true);
    expect(onSetSessionBackground).not.toHaveBeenCalled();
  });

  function renderSidebar({
    onSetSessionBackground,
    sessions
  }: {
    onSetSessionBackground: (sessionId: string, background: boolean) => void;
    sessions: SessionSummary[];
  }) {
    root = createRoot(container!);
    act(() => {
      root!.render(
        <SessionSidebar
          onCloseSession={() => undefined}
          onRenameSession={() => undefined}
          onSelectSession={() => undefined}
          onSetSessionBackground={onSetSessionBackground}
          selectedSessionId={null}
          sessions={sessions}
        />
      );
    });
  }

  function openContextMenu() {
    act(() => {
      container
        ?.querySelector(".sidebar-tree-row")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
  }

  function menuItemLabels() {
    return [...(container?.querySelectorAll(".session-context-menu .app-menu-item") ?? [])].map(
      (item) => item.textContent?.trim()
    );
  }

  function clickButton(label: string) {
    const button = findButton(label);
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  function findButton(label: string) {
    const button = [...(container?.querySelectorAll("button") ?? [])].find((candidate) =>
      candidate.textContent?.includes(label)
    );
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Unable to find button: ${label}`);
    }
    return button;
  }
});

function createSessionSummary(
  sessionId: string,
  title: string,
  status: SessionStatus
): SessionSummary {
  return {
    sessionId,
    title,
    status,
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
