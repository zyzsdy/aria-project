import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");

describe("workbench resize layout styles", () => {
  it("locks the workbench to the viewport instead of growing the page", () => {
    expect(styles).toMatch(/\.workbench\s*{[^}]*height:\s*100vh;[^}]*overflow:\s*hidden;/s);
  });

  it("keeps the main terminal region shrinkable inside the shell", () => {
    expect(styles).toMatch(
      /\.main-shell\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s
    );
    expect(styles).toMatch(
      /\.terminal-region\s*{[^}]*display:\s*(?:grid|flex);[^}]*min-width:\s*0;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s
    );
    expect(styles).toMatch(/\.terminal-surface\s*{[^}]*min-width:\s*0;/s);
    expect(styles).not.toMatch(
      /@media\s*\(max-width:\s*980px\)\s*{[\s\S]*?\.main-shell\s*{[^}]*min-height:\s*70vh;/s
    );
  });
});
