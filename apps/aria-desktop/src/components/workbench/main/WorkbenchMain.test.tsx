import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkbenchMain } from "./WorkbenchMain";
import { createHtmlTab, createTerminalTab } from "./tabState";

describe("WorkbenchMain", () => {
  it("renders the terminal surface for terminal tabs", () => {
    const markup = renderToStaticMarkup(
      <WorkbenchMain
        activeTab={createTerminalTab("session-a")}
        onCloseTab={() => undefined}
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
          appearance: {
            themePreset: "north",
            fontFamily: "Cascadia Mono",
            fontSize: 14,
            lineHeight: 1.2,
            letterSpacing: 0,
            cursorStyle: "block",
            cursorBlink: true
          },
          terminal: {
            scrollbackLines: 2000,
            rightClickBehavior: "paste",
            copyOnSelect: false,
            bellMode: "off"
          },
          workspace: {
            startupBehavior: "restore_previous",
            closeConfirmation: "confirm_running_sessions"
          }
        }}
        streamState="attached"
        tabs={[createTerminalTab("session-a")]}
        terminalHostRef={() => undefined}
      />
    );

    expect(markup).toContain("terminal-region");
    expect(markup).not.toContain("settings-page");
  });

  it("renders the html host for settings tabs", () => {
    const markup = renderToStaticMarkup(
      <WorkbenchMain
        activeTab={createHtmlTab("settings", "Settings")}
        onCloseTab={() => undefined}
        onResetSettingsGroup={() => undefined}
        onSelectSettingsGroup={() => undefined}
        onSelectTab={() => undefined}
        onUpdateSettings={() => undefined}
        selectedSettingsGroup="appearance"
        sessions={[]}
        settings={{
          appearance: {
            themePreset: "north",
            fontFamily: "Cascadia Mono",
            fontSize: 14,
            lineHeight: 1.2,
            letterSpacing: 0,
            cursorStyle: "block",
            cursorBlink: true
          },
          terminal: {
            scrollbackLines: 2000,
            rightClickBehavior: "paste",
            copyOnSelect: false,
            bellMode: "off"
          },
          workspace: {
            startupBehavior: "restore_previous",
            closeConfirmation: "confirm_running_sessions"
          }
        }}
        streamState="attached"
        tabs={[createHtmlTab("settings", "Settings")]}
        terminalHostRef={() => undefined}
      />
    );

    expect(markup).toContain("html-tab-region");
    expect(markup).toContain("settings-page");
    expect(markup).not.toContain("terminal-empty-state");
  });
});
