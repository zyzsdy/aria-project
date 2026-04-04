import { describe, expect, it } from "vitest";
import {
  closeSessionTab,
  openSessionTab,
  reconcileOpenTabs
} from "./tabState";

describe("openSessionTab", () => {
  it("opens a closed session tab and selects it", () => {
    expect(openSessionTab(["session-a"], null, "session-b")).toEqual({
      openTabSessionIds: ["session-a", "session-b"],
      selectedSessionId: "session-b"
    });
  });

  it("does not duplicate an already open session tab", () => {
    expect(openSessionTab(["session-a", "session-b"], "session-a", "session-b")).toEqual({
      openTabSessionIds: ["session-a", "session-b"],
      selectedSessionId: "session-b"
    });
  });
});

describe("closeSessionTab", () => {
  it("keeps the current selection when closing a different tab", () => {
    expect(closeSessionTab(["session-a", "session-b", "session-c"], "session-b", "session-a")).toEqual({
      openTabSessionIds: ["session-b", "session-c"],
      selectedSessionId: "session-b"
    });
  });

  it("selects the left neighbor first when closing the active tab", () => {
    expect(closeSessionTab(["session-a", "session-b", "session-c"], "session-b", "session-b")).toEqual({
      openTabSessionIds: ["session-a", "session-c"],
      selectedSessionId: "session-a"
    });
  });

  it("falls back to the right neighbor and then blank state", () => {
    expect(closeSessionTab(["session-a", "session-b"], "session-a", "session-a")).toEqual({
      openTabSessionIds: ["session-b"],
      selectedSessionId: "session-b"
    });

    expect(closeSessionTab(["session-a"], "session-a", "session-a")).toEqual({
      openTabSessionIds: [],
      selectedSessionId: null
    });
  });
});

describe("reconcileOpenTabs", () => {
  it("removes tabs for sessions that no longer exist without reopening closed tabs", () => {
    expect(
      reconcileOpenTabs(["session-a", "session-b", "session-c"], "session-b", [
        "session-a",
        "session-c"
      ])
    ).toEqual({
      openTabSessionIds: ["session-a", "session-c"],
      selectedSessionId: "session-a"
    });
  });
});
