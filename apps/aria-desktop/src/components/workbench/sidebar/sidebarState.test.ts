import { describe, expect, it } from "vitest";
import { toggleSidebar } from "./sidebarState";

describe("toggleSidebar", () => {
  it("opens sessions from a closed state", () => {
    expect(toggleSidebar(null, "sessions")).toBe("sessions");
  });

  it("switches between sidebar panels", () => {
    expect(toggleSidebar("sessions", "collections")).toBe("collections");
  });

  it("closes the sidebar when clicking the open panel again", () => {
    expect(toggleSidebar("sessions", "sessions")).toBeNull();
  });

  it("ignores settings because it does not control a sidebar yet", () => {
    expect(toggleSidebar("sessions", "settings")).toBe("sessions");
    expect(toggleSidebar(null, "settings")).toBeNull();
  });
});
