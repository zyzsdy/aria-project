// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { defineMessage } from "./messages";
import { I18nProvider, useT } from "./react";
import { createStaticCatalogSource } from "./source";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const SETTINGS_TITLE = defineMessage({
  key: "settings.title",
  defaultMessage: "Settings"
});

describe("I18nProvider", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
    }

    container?.remove();
    container = null;
    root = null;
  });

  it("loads translated messages and falls back through the locale chain", async () => {
    const source = createStaticCatalogSource("bundled", {
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

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <I18nProvider locale="ja-JP" namespaces={["common"]} sources={[source]}>
          <TranslatedText />
        </I18nProvider>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("ÔO¶¨");
  });
});

function TranslatedText() {
  const t = useT();
  return <span>{t(SETTINGS_TITLE)}</span>;
}
