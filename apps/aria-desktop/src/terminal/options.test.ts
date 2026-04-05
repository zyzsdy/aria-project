import { describe, expect, it } from "vitest";
import { createTerminalOptions } from "./options";

describe("createTerminalOptions", () => {
  it("enables the proposed API needed by the Unicode11 addon", () => {
    const options = createTerminalOptions({
      appearance: {
        themePreset: "north",
        fontFamily: "Cascadia Mono",
        fontSize: 14,
        lineHeight: 1.1,
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
    });

    expect(options.allowProposedApi).toBe(true);
    expect(options.fontFamily).toBe("Cascadia Mono");
    expect(options.fontSize).toBe(14);
    expect(options.scrollback).toBe(2000);
  });
});
