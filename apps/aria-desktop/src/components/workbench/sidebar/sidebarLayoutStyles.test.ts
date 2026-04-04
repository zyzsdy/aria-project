import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");

describe("sidebar session list layout styles", () => {
  it("keeps session rows stacked at the top instead of stretching across the panel", () => {
    expect(styles).toMatch(
      /\.session-list\s*{[^}]*display:\s*grid;[^}]*align-content:\s*start;/s
    );
  });
});
