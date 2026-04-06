import { DEFAULT_APP_SETTINGS } from "@aria/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./TerminalWorkspace", () => ({
  TerminalWorkspace: ({
    activeTabId,
    tabs,
    visibility
  }: {
    activeTabId: string | null;
    tabs: Array<{ id: string; sessionId: string }>;
    visibility: "visible" | "hidden";
  }) => (
    <section className="terminal-workspace" data-terminal-workspace-visibility={visibility}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className="terminal-surface"
          data-session-id={tab.sessionId}
          data-terminal-active={String(tab.id === activeTabId && visibility === "visible")}
        />
      ))}
    </section>
  )
}));

import { WorkbenchMain } from "./WorkbenchMain";
import { createHtmlTab, createTerminalTab } from "./tabState";

describe("WorkbenchMain", () => {
  it("renders the terminal surface for terminal tabs", () => {
    const markup = renderToStaticMarkup(
      <WorkbenchMain
        activeTab={createTerminalTab("session-a")}
        onCloseTab={() => undefined}
        onStreamDetached={() => undefined}
        onStreamError={() => undefined}
        onStreamMetadata={() => undefined}
        onStreamMetadataDelta={() => undefined}
        onResetSettingsGroup={() => undefined}
        onSelectSettingsGroup={() => undefined}
        onSelectTab={() => undefined}
        onUpdateSettings={() => undefined}
        selectedSettingsGroup="appearance"
        sessions={[
          {
            sessionId: "session-a",
            title: "PowerShell",
            status: "running",
            transport: "local_pty",
            size: { cols: 80, rows: 24, pixelWidth: 0, pixelHeight: 0 },
            createdAt: "1",
            updatedAt: "1"
          }
        ]}
        settings={{
          ...DEFAULT_APP_SETTINGS,
          appearance: {
            ...DEFAULT_APP_SETTINGS.appearance,
            themePreset: "north",
            fontFamily: "Cascadia Mono",
            fontSize: 14,
            lineHeight: 1.2,
            letterSpacing: 0,
            cursorStyle: "block",
            cursorBlink: true
          },
          terminal: {
            ...DEFAULT_APP_SETTINGS.terminal,
            scrollbackLines: 2000,
            rightClickBehavior: "paste",
            copyOnSelect: false,
            bellMode: "off"
          },
          workspace: {
            ...DEFAULT_APP_SETTINGS.workspace,
            startupBehavior: "restore_previous",
            closeConfirmation: "confirm_running_sessions"
          }
        }}
        tabs={[createTerminalTab("session-a"), createTerminalTab("session-b")]}
      />
    );

    expect(markup).toContain("terminal-workspace");
    expect(markup.match(/terminal-surface/g)).toHaveLength(2);
    expect(markup).toContain('data-terminal-active="true"');
    expect(markup).not.toContain("settings-page");
  });

  it("keeps the terminal workspace mounted behind html tabs", () => {
    const markup = renderToStaticMarkup(
      <WorkbenchMain
        activeTab={createHtmlTab("settings", "Settings")}
        onCloseTab={() => undefined}
        onStreamDetached={() => undefined}
        onStreamError={() => undefined}
        onStreamMetadata={() => undefined}
        onStreamMetadataDelta={() => undefined}
        onResetSettingsGroup={() => undefined}
        onSelectSettingsGroup={() => undefined}
        onSelectTab={() => undefined}
        onUpdateSettings={() => undefined}
        selectedSettingsGroup="appearance"
        sessions={[
          {
            sessionId: "session-a",
            title: "PowerShell",
            status: "running",
            transport: "local_pty",
            size: { cols: 80, rows: 24, pixelWidth: 0, pixelHeight: 0 },
            createdAt: "1",
            updatedAt: "1"
          }
        ]}
        settings={{
          ...DEFAULT_APP_SETTINGS,
          appearance: {
            ...DEFAULT_APP_SETTINGS.appearance,
            themePreset: "north",
            fontFamily: "Cascadia Mono",
            fontSize: 14,
            lineHeight: 1.2,
            letterSpacing: 0,
            cursorStyle: "block",
            cursorBlink: true
          },
          terminal: {
            ...DEFAULT_APP_SETTINGS.terminal,
            scrollbackLines: 2000,
            rightClickBehavior: "paste",
            copyOnSelect: false,
            bellMode: "off"
          },
          workspace: {
            ...DEFAULT_APP_SETTINGS.workspace,
            startupBehavior: "restore_previous",
            closeConfirmation: "confirm_running_sessions"
          }
        }}
        tabs={[createTerminalTab("session-a"), createHtmlTab("settings", "Settings")]}
      />
    );

    expect(markup).toContain("terminal-workspace");
    expect(markup).toContain('data-terminal-workspace-visibility="hidden"');
    expect(markup).toContain("html-tab-region");
    expect(markup).toContain("settings-page");
    expect(markup).toContain("terminal-surface");
  });
});
