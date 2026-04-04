import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SessionTabs } from "./SessionTabs";

describe("SessionTabs structure", () => {
  it("renders the custom scrollbar outside the scrolling viewport", () => {
    const markup = renderToStaticMarkup(
      <SessionTabs
        onCloseTab={() => undefined}
        onSelectTab={() => undefined}
        selectedSessionId="session-1"
        tabs={[{ sessionId: "session-1", title: "Example tab" }]}
      />
    );

    expect(markup).toContain('class="tab-strip-shell"');
    expect(markup).toContain('class="tab-strip"');
    expect(markup).toContain('class="tab-strip-scrollbar ');
    expect(markup).toMatch(
      /class="tab-strip-shell".*class="tab-strip"[\s\S]*class="tab-strip-scrollbar /
    );
  });
});
