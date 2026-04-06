import { describe, expect, it } from "vitest";
import { createMessageFormatter, translateMessage } from "./runtime";
import { defineMessage } from "./messages";

describe("i18n runtime", () => {
  it("formats ICU interpolation, plural, and select messages", () => {
    const formatMessage = createMessageFormatter("en");

    expect(formatMessage("Hello {name}", { name: "Aria" })).toBe("Hello Aria");
    expect(
      formatMessage("{count, plural, one {# tab} other {# tabs}}", { count: 2 })
    ).toBe("2 tabs");
    expect(
      formatMessage(
        "{status, select, running {Running} exited {Exited} other {Unknown}}",
        { status: "running" }
      )
    ).toBe("Running");
  });

  it("prefers catalog messages but falls back to the descriptor default message", () => {
    const message = defineMessage({
      key: "settings.title",
      defaultMessage: "Settings"
    });

    expect(
      translateMessage({
        locale: "ja",
        messages: {
          "settings.title": "ÔO¶¨"
        },
        message
      })
    ).toBe("ÔO¶¨");

    expect(
      translateMessage({
        locale: "ja",
        messages: {},
        message
      })
    ).toBe("Settings");
  });
});
