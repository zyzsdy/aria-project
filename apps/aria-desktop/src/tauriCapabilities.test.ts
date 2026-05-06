import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("tauri capabilities", () => {
  it("allows project tab drags to create webview windows", () => {
    const capability = JSON.parse(
      readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8")
    ) as { permissions?: string[] };

    expect(capability.permissions).toContain("core:webview:allow-create-webview-window");
  });

  it("allows project windows to enumerate webviews for workspace broadcasts", () => {
    const capability = JSON.parse(
      readFileSync(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8")
    ) as { permissions?: string[] };

    expect(capability.permissions).toContain("core:webview:allow-get-all-webviews");
  });
});
