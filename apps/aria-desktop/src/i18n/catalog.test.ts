import { describe, expect, it } from "vitest";
import { parseCatalogToml } from "./catalog";

describe("parseCatalogToml", () => {
  it("flattens nested TOML tables into dot-delimited message keys", () => {
    expect(
      parseCatalogToml(`
[settings]
page_title = "Settings"

[settings.appearance]
heading = "Appearance"
`).messages
    ).toEqual({
      "settings.page_title": "Settings",
      "settings.appearance.heading": "Appearance"
    });
  });
});
