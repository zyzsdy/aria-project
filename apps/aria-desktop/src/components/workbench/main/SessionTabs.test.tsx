// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionTabs } from "./SessionTabs";

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

describe("SessionTabs structure", () => {
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

  it("renders the custom scrollbar outside the scrolling viewport", () => {
    const markup = renderToStaticMarkup(
      <SessionTabs
        busy={false}
        defaultProfileId="builtin:powershell"
        onCloseTab={() => undefined}
        onCreateSession={() => undefined}
        onCreateSessionWithProfile={() => undefined}
        onSelectTab={() => undefined}
        paneId="pane-a"
        profiles={[]}
        selectedTabId="terminal:session-1"
        tabs={[{ tabId: "terminal:session-1", title: "Example tab" }]}
      />
    );

    expect(markup).toContain('class="tab-strip-shell"');
    expect(markup).toContain('class="tab-strip"');
    expect(markup).toContain('class="tab-strip-scrollbar ');
    expect(markup).toMatch(
      /class="tab-strip-shell".*class="tab-strip"[\s\S]*class="tab-strip-scrollbar /
    );
  });

  it("places the new session split button after the last tab in the scroll track", () => {
    const markup = renderToStaticMarkup(
      <SessionTabs
        busy={false}
        defaultProfileId="builtin:powershell"
        onCloseTab={() => undefined}
        onCreateSession={() => undefined}
        onCreateSessionWithProfile={() => undefined}
        onSelectTab={() => undefined}
        paneId="pane-a"
        profiles={[]}
        selectedTabId="terminal:session-2"
        tabs={[
          { tabId: "terminal:session-1", title: "One" },
          { tabId: "terminal:session-2", title: "Two" }
        ]}
      />
    );

    expect(markup).toMatch(
      /class="tab-strip-track\s*"[\s\S]*class="tab"[\s\S]*One[\s\S]*class="tab tab-active"[\s\S]*Two[\s\S]*class="sidebar-split-button tab-strip-new-session"/
    );
  });

  it("marks background session tabs with a ghost prefix", () => {
    const markup = renderToStaticMarkup(
      <SessionTabs
        busy={false}
        defaultProfileId="builtin:powershell"
        onCloseTab={() => undefined}
        onCreateSession={() => undefined}
        onCreateSessionWithProfile={() => undefined}
        onSelectTab={() => undefined}
        paneId="pane-a"
        profiles={[]}
        selectedTabId="terminal:session-2"
        tabs={[
          { tabId: "terminal:session-1", title: "Foreground", isBackground: false },
          { tabId: "terminal:session-2", title: "Background", isBackground: true }
        ]}
      />
    );

    expect(markup).toContain('class="tab-background-marker"');
    expect(markup).toMatch(/👻[\s\S]*Background/);
    expect(markup).not.toMatch(/👻[\s\S]*Foreground/);
  });

  it("opens a shell profile menu from the tab strip new session split button", async () => {
    const onCreateSession = vi.fn();
    const onCreateSessionWithProfile = vi.fn();
    root = createRoot(container!);

    act(() => {
      root!.render(
        <SessionTabs
          busy={false}
          defaultProfileId="builtin:powershell"
          onCloseTab={() => undefined}
          onCreateSession={onCreateSession}
          onCreateSessionWithProfile={onCreateSessionWithProfile}
          onSelectTab={() => undefined}
          paneId="pane-a"
          profiles={[
            {
              id: "builtin:powershell",
              source: "builtin",
              name: "PowerShell",
              executable: "powershell.exe",
              args: [],
              startupDir: null
            },
            {
              id: "custom:git-bash",
              source: "custom",
              name: "Git Bash",
              executable: "bash.exe",
              args: ["--login"],
              startupDir: "C:/work"
            }
          ]}
          selectedTabId={null}
          tabs={[]}
        />
      );
    });

    const createButton = findButton("Create session");
    act(() => {
      createButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCreateSession).toHaveBeenCalledTimes(1);

    const menuButton = findButton("Open shell profiles");
    act(() => {
      menuButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container?.textContent).toContain("PowerShell");
    expect(container?.textContent).toContain("Default");
    expect(container?.textContent).toContain("Git Bash");

    const gitBash = findButton("Git Bash");
    act(() => {
      gitBash.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCreateSessionWithProfile).toHaveBeenCalledWith("custom:git-bash");
  });

  it("opens a tab context menu and dispatches session tab commands", async () => {
    const onCloseTab = vi.fn();
    const onDetachTab = vi.fn();
    const onRenameTab = vi.fn();
    const onSplitPane = vi.fn();
    root = createRoot(container!);

    act(() => {
      root!.render(
        <SessionTabs
          busy={false}
          defaultProfileId="builtin:powershell"
          onCloseTab={onCloseTab}
          onCreateSession={() => undefined}
          onCreateSessionWithProfile={() => undefined}
          onDetachTab={onDetachTab}
          onRenameTab={onRenameTab}
          onSelectTab={() => undefined}
          onSplitPane={onSplitPane}
          paneId="pane-a"
          profiles={[]}
          selectedTabId="terminal:session-1"
          tabs={[
            {
              kind: "terminal",
              sessionId: "session-1",
              status: "running",
              tabId: "terminal:session-1",
              title: "PowerShell"
            }
          ]}
        />
      );
    });

    const tab = container?.querySelector(".tab");
    act(() => {
      tab?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 12, clientY: 34 }));
    });

    expect(container?.querySelector(".tab-context-menu")).not.toBeNull();
    expect(container?.textContent).toContain("Rename");
    expect(container?.textContent).toContain("Split vertically");
    expect(container?.textContent).toContain("Split horizontally");
    expect(container?.textContent).toContain("Detach");
    expect(container?.textContent).toContain("Close");

    act(() => {
      findButton("Rename").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRenameTab).toHaveBeenCalledWith("terminal:session-1", "session-1");

    act(() => {
      tab?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() => {
      findButton("Split vertically").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSplitPane).toHaveBeenCalledWith("vertical");

    act(() => {
      tab?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() => {
      findButton("Split horizontally").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSplitPane).toHaveBeenCalledWith("horizontal");

    act(() => {
      tab?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() => {
      findButton("Detach").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onDetachTab).toHaveBeenCalledWith("terminal:session-1", "session-1");

    act(() => {
      tab?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() => {
      findButton("Close").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCloseTab).toHaveBeenCalledWith("terminal:session-1");
  });

  it("hides detach and rename for non-running or non-session tabs", async () => {
    root = createRoot(container!);

    act(() => {
      root!.render(
        <SessionTabs
          busy={false}
          defaultProfileId="builtin:powershell"
          onCloseTab={() => undefined}
          onCreateSession={() => undefined}
          onCreateSessionWithProfile={() => undefined}
          onRenameTab={() => undefined}
          onSelectTab={() => undefined}
          paneId="pane-a"
          profiles={[]}
          selectedTabId="settings-tab"
          tabs={[
            {
              kind: "html",
              sessionId: null,
              status: null,
              tabId: "settings-tab",
              title: "Settings"
            },
            {
              kind: "terminal",
              sessionId: "session-background",
              status: "background",
              tabId: "terminal:background",
              title: "Background"
            }
          ]}
        />
      );
    });

    const tabs = container?.querySelectorAll(".tab");
    act(() => {
      tabs?.[0]?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    expect(container?.textContent).not.toContain("Rename");
    expect(container?.textContent).not.toContain("Detach");
    expect(container?.textContent).toContain("Close");

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    act(() => {
      tabs?.[1]?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });

    expect(container?.textContent).toContain("Rename");
    expect(container?.textContent).not.toContain("Detach");
  });

  it("moves a tab with pointer events instead of browser native drag-and-drop", async () => {
    const onMoveTab = vi.fn();
    root = createRoot(container!);

    act(() => {
      root!.render(
        <SessionTabs
          busy={false}
          defaultProfileId="builtin:powershell"
          onCloseTab={() => undefined}
          onCreateSession={() => undefined}
          onCreateSessionWithProfile={() => undefined}
          onMoveTab={onMoveTab}
          onSelectTab={() => undefined}
          paneId="pane-a"
          profiles={[]}
          selectedTabId="tab-a"
          tabs={[
            { tabId: "tab-a", title: "Alpha" },
            { tabId: "tab-b", title: "Beta" }
          ]}
        />
      );
    });

    const tabs = container!.querySelectorAll(".tab");
    mockRect(tabs[1]!, { left: 10, width: 100 });
    mockElementFromPoint(tabs[1]!);

    act(() => {
      tabs[0]!.dispatchEvent(createPointerEvent("pointerdown", 1, 0, 0));
    });
    act(() => {
      window.dispatchEvent(createPointerEvent("pointermove", 1, 80, 0));
    });
    act(() => {
      window.dispatchEvent(createPointerEvent("pointerup", 1, 80, 0));
    });

    expect(onMoveTab).toHaveBeenCalledWith("pane-a", "tab-a", "pane-a", 2);
    expect(container!.querySelector(".tab-dragging")).toBeNull();
  });

  it("selects a tab from pointer release when pointer capture prevents a button click", async () => {
    const onSelectTab = vi.fn();
    root = createRoot(container!);

    act(() => {
      root!.render(
        <SessionTabs
          busy={false}
          defaultProfileId="builtin:powershell"
          onCloseTab={() => undefined}
          onCreateSession={() => undefined}
          onCreateSessionWithProfile={() => undefined}
          onMoveTab={() => undefined}
          onSelectTab={onSelectTab}
          paneId="pane-a"
          profiles={[]}
          selectedTabId="tab-a"
          tabs={[
            { tabId: "tab-a", title: "Alpha" },
            { tabId: "tab-b", title: "Beta" }
          ]}
        />
      );
    });

    const tabs = container!.querySelectorAll(".tab");
    act(() => {
      tabs[1]!.dispatchEvent(createPointerEvent("pointerdown", 1, 10, 10));
    });
    act(() => {
      window.dispatchEvent(createPointerEvent("pointerup", 1, 10, 10));
    });

    expect(onSelectTab).toHaveBeenCalledWith("tab-b");
  });

  it("moves a tab to a new window when released outside the current viewport", async () => {
    const onMoveTabToNewWindow = vi.fn();
    root = createRoot(container!);

    act(() => {
      root!.render(
        <SessionTabs
          busy={false}
          defaultProfileId="builtin:powershell"
          onCloseTab={() => undefined}
          onCreateSession={() => undefined}
          onCreateSessionWithProfile={() => undefined}
          onMoveTab={() => undefined}
          onMoveTabToNewWindow={onMoveTabToNewWindow}
          onSelectTab={() => undefined}
          paneId="pane-a"
          profiles={[]}
          selectedTabId="tab-a"
          tabs={[{ tabId: "tab-a", title: "Alpha" }]}
        />
      );
    });

    const tab = container!.querySelector(".tab")!;
    act(() => {
      tab.dispatchEvent(createPointerEvent("pointerdown", 1, 10, 10));
    });
    act(() => {
      window.dispatchEvent(createPointerEvent("pointermove", 1, window.innerWidth + 40, 20));
    });
    act(() => {
      window.dispatchEvent(createPointerEvent("pointerup", 1, window.innerWidth + 40, 20));
    });

    expect(onMoveTabToNewWindow).toHaveBeenCalledWith("pane-a", "tab-a", {
      x: window.innerWidth + 40,
      y: 20
    });
  });

  it("renders a shared cross-pane drop marker for the target pane", async () => {
    root = createRoot(container!);

    act(() => {
      root!.render(
        <SessionTabs
          busy={false}
          defaultProfileId="builtin:powershell"
          dragPreview={{
            draggingTabId: "tab-a",
            dropIndex: 1,
            dropPlacement: "after",
            dropTabId: "tab-b",
            sourcePaneId: "pane-a",
            targetPaneId: "pane-b"
          }}
          onCloseTab={() => undefined}
          onCreateSession={() => undefined}
          onCreateSessionWithProfile={() => undefined}
          onMoveTab={() => undefined}
          onSelectTab={() => undefined}
          paneId="pane-b"
          profiles={[]}
          selectedTabId="tab-b"
          tabs={[{ tabId: "tab-b", title: "Beta" }]}
        />
      );
    });

    expect(container!.querySelector(".tab-drop-after")).not.toBeNull();
  });

  function findButton(label: string) {
    const button = [...(container?.querySelectorAll("button") ?? [])].find((candidate) => {
      const ariaLabel = candidate.getAttribute("aria-label");
      return ariaLabel === label || candidate.textContent?.includes(label);
    });

    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Unable to find button: ${label}`);
    }

    return button;
  }
});

function mockRect(element: Element, rect: { left: number; width: number }) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: 24,
      height: 24,
      left: rect.left,
      right: rect.left + rect.width,
      top: 0,
      width: rect.width,
      x: rect.left,
      y: 0,
      toJSON: () => undefined
    })
  });
}

function mockElementFromPoint(element: Element) {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => element
  });
}

function createPointerEvent(type: string, pointerId: number, clientX: number, clientY: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX,
    clientY
  });
  Object.defineProperty(event, "pointerId", {
    configurable: true,
    value: pointerId
  });
  return event;
}
