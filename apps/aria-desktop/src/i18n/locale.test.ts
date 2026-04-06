import { describe, expect, it } from "vitest";
import { buildLocaleLoadChain, resolveRequestedLocale } from "./locale";

describe("locale resolution", () => {
  it("falls back from exact locale to a matching base language locale", () => {
    expect(
      buildLocaleLoadChain({
        availableLocales: ["en", "zh-CN", "ja"],
        requestedLocale: "ja-JP"
      })
    ).toEqual(["en", "ja"]);
  });

  it("maps system locale to a same-language bundled locale when no exact locale exists", () => {
    expect(
      buildLocaleLoadChain({
        availableLocales: ["en", "zh-CN", "ja"],
        requestedLocale: "system",
        systemLocale: "zh-HK"
      })
    ).toEqual(["en", "zh-CN"]);
  });

  it("returns the resolved locale alongside the requested locale", () => {
    expect(
      resolveRequestedLocale({
        availableLocales: ["en", "zh-CN", "ja"],
        requestedLocale: "ja-JP"
      })
    ).toMatchObject({
      requestedLocale: "ja-JP",
      resolvedLocale: "ja"
    });
  });
});
