import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop xterm package usage", () => {
  it("uses @xterm/xterm consistently across the desktop app", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8")
    ) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.["@xterm/xterm"]).toBeDefined();
    expect(packageJson.dependencies?.xterm).toBeUndefined();

    expect(readFileSync(new URL("../App.tsx", import.meta.url), "utf8")).toContain(
      'from "@xterm/xterm";'
    );
    expect(readFileSync(new URL("../App.tsx", import.meta.url), "utf8")).not.toContain(
      'from "xterm";'
    );

    expect(readFileSync(new URL("../main.tsx", import.meta.url), "utf8")).toContain(
      '"@xterm/xterm/css/xterm.css"'
    );
    expect(readFileSync(new URL("../main.tsx", import.meta.url), "utf8")).not.toContain(
      '"xterm/css/xterm.css"'
    );

    expect(readFileSync(new URL("../settings/appSettings.ts", import.meta.url), "utf8")).toContain(
      'from "@xterm/xterm";'
    );
    expect(
      readFileSync(new URL("../settings/appSettings.ts", import.meta.url), "utf8")
    ).not.toContain('from "xterm";');

    expect(readFileSync(new URL("./options.ts", import.meta.url), "utf8")).toContain(
      'from "@xterm/xterm";'
    );
    expect(readFileSync(new URL("./options.ts", import.meta.url), "utf8")).not.toContain(
      'from "xterm";'
    );
  });
});
