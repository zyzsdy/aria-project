import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createPlatformDefaultSettings } from "../../../settings/appSettings";
import { SidebarHost } from "./SidebarHost";

describe("SidebarHost", () => {
  it("renders a split new-session control with a profile menu", () => {
    const settings = createPlatformDefaultSettings("windows");
    const markup = renderToStaticMarkup(
      createElement(SidebarHost as any, {
        busy: false,
        defaultProfileId: settings.profiles.defaultProfileId,
        onCreateSession: () => undefined,
        onCreateSessionWithProfile: () => undefined,
        onRefresh: () => undefined,
        onSelectSession: () => undefined,
        openProfileMenu: true,
        onProfileMenuOpenChange: () => undefined,
        openSidebar: "sessions",
        profiles: [
          ...settings.profiles.items,
          {
            id: "custom:fish",
            source: "custom",
            name: "Fish",
            executable: "fish",
            args: ["--login"],
            startupDir: "D:/shells"
          }
        ],
        selectedSessionId: null,
        sessions: []
      })
    );

    expect(markup).toContain("Create session");
    expect(markup).toContain("Open shell profiles");
    expect(markup).toContain("PowerShell");
    expect(markup).toContain("Command Prompt");
    expect(markup).toContain("Fish");
    expect(markup).toContain("Default");
  });
});
