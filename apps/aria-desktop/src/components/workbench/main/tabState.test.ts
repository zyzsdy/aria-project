import { describe, expect, it } from "vitest";
import {
  closeWorkbenchTab,
  createHtmlTab,
  createTerminalTab,
  openWorkbenchTab,
  reconcileOpenTabs
} from "./tabState";

describe("openWorkbenchTab", () => {
  it("opens a closed terminal tab and selects it", () => {
    expect(
      openWorkbenchTab([createTerminalTab("session-a")], "terminal:session-a", createTerminalTab("session-b"))
    ).toEqual({
      tabs: [createTerminalTab("session-a"), createTerminalTab("session-b")],
      selectedTabId: "terminal:session-b"
    });
  });

  it("keeps settings as a singleton html tab", () => {
    expect(
      openWorkbenchTab(
        [createTerminalTab("session-a"), createHtmlTab("settings", "Settings")],
        "terminal:session-a",
        createHtmlTab("settings", "Settings")
      )
    ).toEqual({
      tabs: [createTerminalTab("session-a"), createHtmlTab("settings", "Settings")],
      selectedTabId: "html:settings"
    });
  });
});

describe("closeWorkbenchTab", () => {
  it("keeps the current selection when closing a different tab", () => {
    expect(
      closeWorkbenchTab(
        [createTerminalTab("session-a"), createTerminalTab("session-b"), createHtmlTab("settings", "Settings")],
        "terminal:session-b",
        "terminal:session-a"
      )
    ).toEqual({
      tabs: [createTerminalTab("session-b"), createHtmlTab("settings", "Settings")],
      selectedTabId: "terminal:session-b"
    });
  });

  it("selects the left neighbor first when closing the active tab", () => {
    expect(
      closeWorkbenchTab(
        [createTerminalTab("session-a"), createTerminalTab("session-b"), createTerminalTab("session-c")],
        "terminal:session-b",
        "terminal:session-b"
      )
    ).toEqual({
      tabs: [createTerminalTab("session-a"), createTerminalTab("session-c")],
      selectedTabId: "terminal:session-a"
    });
  });

  it("falls back to the right neighbor and then blank state", () => {
    expect(
      closeWorkbenchTab(
        [createTerminalTab("session-a"), createHtmlTab("settings", "Settings")],
        "terminal:session-a",
        "terminal:session-a"
      )
    ).toEqual({
      tabs: [createHtmlTab("settings", "Settings")],
      selectedTabId: "html:settings"
    });

    expect(closeWorkbenchTab([createTerminalTab("session-a")], "terminal:session-a", "terminal:session-a")).toEqual({
      tabs: [],
      selectedTabId: null
    });
  });
});

describe("reconcileOpenTabs", () => {
  it("removes stale terminal tabs while preserving html tabs", () => {
    expect(
      reconcileOpenTabs(
        [
          createTerminalTab("session-a"),
          createHtmlTab("settings", "Settings"),
          createTerminalTab("session-b"),
          createTerminalTab("session-c")
        ],
        "terminal:session-b",
        ["session-a", "session-c"]
      )
    ).toEqual({
      tabs: [
        createTerminalTab("session-a"),
        createHtmlTab("settings", "Settings"),
        createTerminalTab("session-c")
      ],
      selectedTabId: "terminal:session-a"
    });
  });
});
