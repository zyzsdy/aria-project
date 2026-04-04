import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");

describe("tab strip styles", () => {
  it("prevents vertical scrolling and hides the native scrollbar in favor of a hover-only overlaid 1px rail", () => {
    expect(styles).toMatch(
      /\.tab-strip-shell\s*{[^}]*position:\s*relative;[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/s
    );
    expect(styles).toMatch(
      /\.tab-strip\s*{[^}]*height:\s*100%;[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;/s
    );
    expect(styles).not.toMatch(/--tab-strip-native-gutter/);
    expect(styles).not.toMatch(/padding-bottom:\s*var\(--tab-strip-native-gutter\)/);
    expect(styles).not.toMatch(/margin-bottom:\s*calc\(var\(--tab-strip-native-gutter\)/);
    expect(styles).toMatch(
      /\.tab-strip::\-webkit-scrollbar\s*{[^}]*display:\s*none;/s
    );
    expect(styles).toMatch(
      /\.tab-strip-scrollbar\s*{[^}]*height:\s*1px;[^}]*opacity:\s*0;[^}]*transition:\s*opacity\s+120ms\s+ease;/s
    );
    expect(styles).toMatch(
      /\.tab-strip-scrollbar\s*{[^}]*position:\s*absolute;[^}]*bottom:\s*0;/s
    );
    expect(styles).toMatch(
      /\.tab-strip-shell:hover\s+\.tab-strip-scrollbar-visible\s*{[^}]*opacity:\s*1;/s
    );
    expect(styles).toMatch(
      /\.tab-strip-scrollbar-thumb\s*{[^}]*background:\s*rgba\([^)]+,\s*0\.\d+\);/s
    );
  });

  it("sizes tabs by title length within the requested bounds", () => {
    expect(styles).toMatch(
      /\.tab\s*{[^}]*width:\s*fit-content;[^}]*min-width:\s*120px;[^}]*max-width:\s*240px;/s
    );
  });

  it("does not force each tab to fill the strip height", () => {
    expect(styles).not.toMatch(/\.tab\s*{[^}]*height:\s*100%;/s);
  });

  it("gives the active tab a VS Code-like emphasis", () => {
    expect(styles).toMatch(
      /\.tab\s*{[^}]*border-top:\s*2px\s+solid\s+transparent;[^}]*border-bottom:\s*1px\s+solid\s+var\(--border-soft\);[^}]*background:\s*var\(--bg-tabstrip\);/s
    );
    expect(styles).toMatch(
      /\.tab-active\s*{[^}]*margin-bottom:\s*-1px;[^}]*z-index:\s*1;[^}]*border-top-color:\s*var\(--accent\);[^}]*border-bottom-color:\s*transparent;[^}]*background:\s*var\(--bg-terminal\);/s
    );
  });

  it("keeps the custom scrollbar above the active tab overlap", () => {
    expect(styles).toMatch(
      /\.tab-strip-scrollbar\s*{[^}]*z-index:\s*2;/s
    );
  });
});
