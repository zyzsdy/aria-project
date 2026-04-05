import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActivityRail } from "./ActivityRail";

describe("ActivityRail", () => {
  it("renders a tools menu trigger in the bottom rail group", () => {
    const markup = renderToStaticMarkup(
      <ActivityRail
        isToolMenuOpen={true}
        onAbout={() => undefined}
        onCheckForUpdates={() => undefined}
        onOpenSidebarChange={() => undefined}
        onSettings={() => undefined}
        onToolMenuOpenChange={() => undefined}
        openSidebar="sessions"
      />
    );

    expect(markup).toContain("Open tools menu");
    expect(markup).toContain("Settings");
    expect(markup).toContain("Check for Updates");
    expect(markup).toContain("About");
  });
});
