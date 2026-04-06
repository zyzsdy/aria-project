import { parseCatalogToml } from "./catalog";
import { createStaticCatalogSource } from "./source";
import commonEn from "./locales/en/common.toml?raw";
import workbenchEn from "./locales/en/workbench.toml?raw";
import settingsEn from "./locales/en/settings.toml?raw";
import dialogsEn from "./locales/en/dialogs.toml?raw";
import commonZhCn from "./locales/zh-CN/common.toml?raw";
import workbenchZhCn from "./locales/zh-CN/workbench.toml?raw";
import settingsZhCn from "./locales/zh-CN/settings.toml?raw";
import dialogsZhCn from "./locales/zh-CN/dialogs.toml?raw";
import commonJa from "./locales/ja/common.toml?raw";
import workbenchJa from "./locales/ja/workbench.toml?raw";
import settingsJa from "./locales/ja/settings.toml?raw";
import dialogsJa from "./locales/ja/dialogs.toml?raw";

export const BUNDLED_CATALOG_SOURCE = createStaticCatalogSource("bundled", {
  en: {
    common: parseCatalogToml(commonEn).messages,
    workbench: parseCatalogToml(workbenchEn).messages,
    settings: parseCatalogToml(settingsEn).messages,
    dialogs: parseCatalogToml(dialogsEn).messages
  },
  "zh-CN": {
    common: parseCatalogToml(commonZhCn).messages,
    workbench: parseCatalogToml(workbenchZhCn).messages,
    settings: parseCatalogToml(settingsZhCn).messages,
    dialogs: parseCatalogToml(dialogsZhCn).messages
  },
  ja: {
    common: parseCatalogToml(commonJa).messages,
    workbench: parseCatalogToml(workbenchJa).messages,
    settings: parseCatalogToml(settingsJa).messages,
    dialogs: parseCatalogToml(dialogsJa).messages
  }
});
