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
        profiles={[]}
        selectedTabId="terminal:session-2"
        tabs={[
          { tabId: "terminal:session-1", title: "One" },
          { tabId: "terminal:session-2", title: "Two" }
        ]}
      />
    );

    expect(markup).toMatch(
      /class="tab-strip-track"[\s\S]*class="tab "[\s\S]*One[\s\S]*class="tab tab-active"[\s\S]*Two[\s\S]*class="sidebar-split-button tab-strip-new-session"/
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
