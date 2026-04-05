import { describe, expect, it, vi } from "vitest";
import * as unicodeModule from "./unicode";

type UnicodeAddon = {
  activate?: (terminal: UnicodeTerminal) => void;
  dispose(): void;
};

type UnicodeTerminal = {
  loadAddon(addon: UnicodeAddon): void;
  unicode: {
    activeVersion: string;
    versions: readonly string[];
  };
};

describe("activateUnicodeGraphemes", () => {
  it("loads the grapheme addon and switches the terminal to grapheme-aware Unicode", () => {
    const addon: UnicodeAddon = {
      activate: vi.fn((terminal: UnicodeTerminal) => {
        if (terminal.unicode.versions.includes("15-graphemes")) {
          terminal.unicode.activeVersion = "15-graphemes";
        }
      }),
      dispose: vi.fn()
    };

    const terminal: UnicodeTerminal = {
      loadAddon(addonToLoad) {
        addonToLoad.activate?.(terminal);
      },
      unicode: {
        activeVersion: "6",
        versions: ["6", "15-graphemes"]
      }
    };

    const activateUnicodeGraphemes = (
      unicodeModule as Record<string, unknown>
    ).activateUnicodeGraphemes as ((terminal: UnicodeTerminal, addon: UnicodeAddon) => void) | undefined;

    expect(typeof activateUnicodeGraphemes).toBe("function");
    activateUnicodeGraphemes?.(terminal, addon);

    expect(addon.activate).toHaveBeenCalledWith(terminal);
    expect(terminal.unicode.activeVersion).toBe("15-graphemes");
  });
});
