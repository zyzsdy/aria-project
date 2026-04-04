import { describe, expect, it } from "vitest";
import { getTabStripThumbMetrics } from "./tabStripScrollbar";

describe("getTabStripThumbMetrics", () => {
  it("hides the custom scrollbar when tabs do not overflow", () => {
    expect(
      getTabStripThumbMetrics({
        clientWidth: 320,
        scrollLeft: 0,
        scrollWidth: 320
      })
    ).toEqual({
      offset: 0,
      size: 0,
      visible: false
    });
  });

  it("computes a thumb width and offset for overflowing tab strips", () => {
    expect(
      getTabStripThumbMetrics({
        clientWidth: 240,
        scrollLeft: 120,
        scrollWidth: 480
      })
    ).toEqual({
      offset: 60,
      size: 120,
      visible: true
    });
  });
});
