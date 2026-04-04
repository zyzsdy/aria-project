import { describe, expect, it } from "vitest";
import {
  getTabStripScrollDelta,
  shouldHandleTabStripWheel
} from "./tabStripScroll";

describe("getTabStripScrollDelta", () => {
  it("uses vertical wheel movement as horizontal scroll when needed", () => {
    expect(getTabStripScrollDelta({ deltaX: 0, deltaY: 80 })).toBe(80);
  });

  it("preserves native horizontal wheel movement", () => {
    expect(getTabStripScrollDelta({ deltaX: 36, deltaY: 0 })).toBe(36);
  });
});

describe("shouldHandleTabStripWheel", () => {
  it("only redirects wheel scrolling when the tab strip actually overflows", () => {
    expect(
      shouldHandleTabStripWheel({
        clientWidth: 500,
        deltaX: 0,
        deltaY: 60,
        scrollWidth: 760
      })
    ).toBe(true);

    expect(
      shouldHandleTabStripWheel({
        clientWidth: 500,
        deltaX: 0,
        deltaY: 60,
        scrollWidth: 500
      })
    ).toBe(false);
  });
});
