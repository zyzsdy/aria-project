// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityRail } from "./ActivityRail";
import { BUNDLED_CATALOG_SOURCE } from "../../i18n/bundledCatalogSource";
import { DESKTOP_I18N_NAMESPACES } from "../../i18n/namespaces";
import { I18nProvider } from "../../i18n/react";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("ActivityRail", () => {
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

  it.each([
    {
      locale: "en",
      menuLabel: "Menu",
      openLabel: "Open menu",
      settingsLabel: "Settings",
      aboutLabel: "About"
    },
    {
      locale: "zh-CN",
      menuLabel: "菜单",
      openLabel: "打开菜单",
      settingsLabel: "设置",
      aboutLabel: "关于"
    },
    {
      locale: "ja",
      menuLabel: "メニュー",
      openLabel: "メニューを開く",
      settingsLabel: "設定",
      aboutLabel: "このアプリについて"
    }
  ])(
    "renders the localized menu trigger copy for $locale",
    async ({ locale, menuLabel, openLabel, settingsLabel, aboutLabel }) => {
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);

      await act(async () => {
        root?.render(
          <I18nProvider
            locale={locale}
            namespaces={DESKTOP_I18N_NAMESPACES}
            sources={[BUNDLED_CATALOG_SOURCE]}
          >
            <ActivityRail
              isToolMenuOpen={true}
              onAbout={() => undefined}
              onCheckForUpdates={() => undefined}
              onOpenSidebarChange={() => undefined}
              onSettings={() => undefined}
              onToolMenuOpenChange={() => undefined}
              openSidebar="sessions"
            />
          </I18nProvider>
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(container.textContent).toContain(menuLabel);
      expect(container.querySelector(`[aria-label="${openLabel}"]`)).not.toBeNull();
      expect(container.textContent).toContain(settingsLabel);
      expect(container.textContent).toContain(aboutLabel);
    }
  );

  it("renders projects as the top rail item", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <I18nProvider
          locale="en"
          namespaces={DESKTOP_I18N_NAMESPACES}
          sources={[BUNDLED_CATALOG_SOURCE]}
        >
          <ActivityRail
            isToolMenuOpen={false}
            onAbout={() => undefined}
            onCheckForUpdates={() => undefined}
            onOpenSidebarChange={() => undefined}
            onSettings={() => undefined}
            onToolMenuOpenChange={() => undefined}
            openSidebar="projects"
          />
        </I18nProvider>
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const buttons = [...(container.querySelectorAll(".rail-group:first-child .rail-button") ?? [])];
    expect(buttons[0]?.getAttribute("aria-label")).toBe("Projects");
    expect(buttons[0]?.className).toContain("rail-button-active");
  });
});
