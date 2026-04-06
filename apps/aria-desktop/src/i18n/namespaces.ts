export const DESKTOP_I18N_NAMESPACES = ["common", "workbench", "settings", "dialogs"] as const;

export type DesktopI18nNamespace = (typeof DESKTOP_I18N_NAMESPACES)[number];
