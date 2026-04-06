import { describe, expect, it } from "vitest";
import { createStaticCatalogSource, getAvailableCatalogLocales, loadCatalogMessages } from "./source";

describe("catalog sources", () => {
  it("collects locales and merges fallback, locale-specific, and override sources in order", async () => {
    const bundled = createStaticCatalogSource("bundled", {
      en: {
        common: {
          "settings.title": "Settings"
        }
      },
      ja: {
        common: {
          "settings.title": "ÔO¶¨"
        }
      }
    });
    const plugin = createStaticCatalogSource("plugin", {
      ja: {
        common: {
          "settings.title": "ÔO¶¨¥á¥Ë¥å©`"
        }
      }
    });

    expect(getAvailableCatalogLocales([bundled, plugin])).toEqual(["en", "ja"]);

    await expect(
      loadCatalogMessages({
        localeChain: ["en", "ja"],
        namespace: "common",
        sources: [bundled, plugin]
      })
    ).resolves.toEqual({
      "settings.title": "ÔO¶¨¥á¥Ë¥å©`"
    });
  });
});
