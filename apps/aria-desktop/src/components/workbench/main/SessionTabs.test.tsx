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
