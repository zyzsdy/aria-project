import { describe, expect, it, vi } from "vitest";
import { activateUnicode11 } from "./unicode";

describe("activateUnicode11", () => {
  it("loads the Unicode11 addon and switches the terminal to Unicode 11", () => {
    const addon = { dispose: vi.fn() };
    const loadAddon = vi.fn();
    const terminal = {
      loadAddon,
      unicode: {
        activeVersion: "6",
        versions: ["6", "11"]
      }
    };

    activateUnicode11(terminal, addon);

    expect(loadAddon).toHaveBeenCalledWith(addon);
    expect(terminal.unicode.activeVersion).toBe("11");
  });
});
