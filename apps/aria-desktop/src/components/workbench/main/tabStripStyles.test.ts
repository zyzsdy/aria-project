import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");
const baseStyles = styles.slice(styles.indexOf(".tab-strip-new-session {"));

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

  it("keeps the tab strip new session control fixed-size inside the scroll track", () => {
    expect(styles).toMatch(
      /\.tab-strip-new-session\s*{[^}]*flex:\s*0\s+0\s+auto;[^}]*height:\s*24px;[^}]*margin:\s*4px\s+6px;/s
    );
    expect(styles).toMatch(
      /\.tab-strip-new-session\s+\.sidebar-split-button-segment\s*{[^}]*width:\s*24px;[^}]*height:\s*22px;/s
    );
  });

  it("keeps dark theme tab strip new session controls flat until hover", () => {
    expect(baseStyles).toMatch(
      /\.tab-strip-new-session\s*{[^}]*border:\s*0;[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;/s
    );
    expect(baseStyles).toMatch(
      /\.tab-strip-new-session\s+\.sidebar-split-button-segment\s*{[^}]*width:\s*24px;[^}]*height:\s*22px;[^}]*border:\s*0;[^}]*background:\s*transparent;/s
    );
    expect(baseStyles).toMatch(
      /\.tab-strip-new-session\s+\.sidebar-split-button-toggle\s*{[^}]*border-left:\s*0;/s
    );
    expect(baseStyles).toMatch(
      /\.tab-strip-new-session\s+\.sidebar-split-button-segment:hover,[\s\S]*\.tab-strip-new-session\s+\.sidebar-split-button-segment:focus-visible\s*{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.\d+\);/s
    );
  });

  it("keeps light theme tab buttons inheriting the tab state instead of global button chrome", () => {
    expect(styles).toMatch(
      /\[data-theme-mode="light"\]\s+\.tab-button,\s*\[data-theme-mode="light"\]\s+\.tab-close-button\s*{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*color:\s*inherit;/s
    );
    expect(styles).toMatch(
      /\[data-theme-mode="light"\]\s+\.tab-active\s*{[^}]*background:\s*var\(--bg-tab-active\);/s
    );
  });

  it("keeps the light theme tab strip new session control visually flat until hover", () => {
    expect(styles).toMatch(
      /\[data-theme-mode="light"\]\s+\.tab-strip-new-session\s*{[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;/s
    );
    expect(styles).toMatch(
      /\[data-theme-mode="light"\]\s+\.tab-strip-new-session\s+\.sidebar-split-button-segment\s*{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*color:\s*var\(--text-secondary\);/s
    );
    expect(styles).toMatch(
      /\[data-theme-mode="light"\]\s+\.tab-strip-new-session\s+\.sidebar-split-button-segment:hover,[\s\S]*\[data-theme-mode="light"\]\s+\.tab-strip-new-session\s+\.sidebar-split-button-segment:focus-visible\s*{[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.\d+\);/s
    );
  });

  it("mirrors the light tab strip overrides in system light mode", () => {
    expect(styles).toMatch(
      /@media\s*\(prefers-color-scheme:\s*light\)\s*{[\s\S]*\[data-theme-mode="system"\]\s+\.tab-button,\s*\[data-theme-mode="system"\]\s+\.tab-close-button\s*{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*color:\s*inherit;/s
    );
    expect(styles).toMatch(
      /@media\s*\(prefers-color-scheme:\s*light\)\s*{[\s\S]*\[data-theme-mode="system"\]\s+\.tab-strip-new-session\s*{[^}]*border-color:\s*transparent;[^}]*background:\s*transparent;/s
    );
  });

  it("keeps project pane split icon buttons flat in light modes until hover", () => {
    expect(styles).toMatch(
      /\[data-theme-mode="light"\]\s+\.sidebar-icon-button\s*{[^}]*border:\s*0;[^}]*background:\s*transparent;/s
    );
    expect(styles).toMatch(
      /\[data-theme-mode="light"\]\s+\.sidebar-icon-button:hover,[\s\S]*\[data-theme-mode="light"\]\s+\.sidebar-icon-button:focus-visible\s*{[^}]*border:\s*0;[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.\d+\);/s
    );
    expect(styles).toMatch(
      /@media\s*\(prefers-color-scheme:\s*light\)\s*{[\s\S]*\[data-theme-mode="system"\]\s+\.sidebar-icon-button\s*{[^}]*border:\s*0;[^}]*background:\s*transparent;/s
    );
  });

  it("positions the tab strip profile menu outside the clipped scroll viewport", () => {
    expect(styles).toMatch(
      /\.tab-strip-profile-menu\s*{[^}]*position:\s*fixed;[^}]*z-index:\s*40;/s
    );
    expect(styles).not.toMatch(/\.tab-strip-profile-menu\s*{[^}]*position:\s*absolute;/s);
  });
});
