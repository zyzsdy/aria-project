import type { AppSettings, ThemePreset } from "@aria/types";
import { DEFAULT_APP_SETTINGS } from "@aria/types";
import type { ITheme, Terminal } from "@xterm/xterm";

export { DEFAULT_APP_SETTINGS };

export type ThemeOption = {
  id: ThemePreset;
};

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "north" },
  { id: "oxide" },
  { id: "forest" }
];

const TERMINAL_THEMES: Record<ThemePreset, ITheme> = {
  north: {
    background: "#05080d",
    foreground: "#dce8f7",
    cursor: "#7ac2ff",
    selectionBackground: "#28405d99",
    black: "#1a2029",
    red: "#dd7b7b",
    green: "#7ecf9a",
    yellow: "#d8b56b",
    blue: "#6aa9ff",
    magenta: "#b999ff",
    cyan: "#6fd3d7",
    white: "#dce8f7",
    brightBlack: "#556170",
    brightRed: "#ff9f9f",
    brightGreen: "#9bf0b7",
    brightYellow: "#efca7d",
    brightBlue: "#8bc0ff",
    brightMagenta: "#cfb7ff",
    brightCyan: "#92e8ea",
    brightWhite: "#ffffff"
  },
  oxide: {
    background: "#0a0c10",
    foreground: "#e6e1d8",
    cursor: "#f1a75f",
    selectionBackground: "#61442888",
    black: "#1f1e1b",
    red: "#d87572",
    green: "#8fbe77",
    yellow: "#d4bc72",
    blue: "#7ea9cf",
    magenta: "#b89fd9",
    cyan: "#7cc3bd",
    white: "#e6e1d8",
    brightBlack: "#656158",
    brightRed: "#f59d99",
    brightGreen: "#acd88c",
    brightYellow: "#efd08b",
    brightBlue: "#9cc5ea",
    brightMagenta: "#cfb7ef",
    brightCyan: "#9ce0d9",
    brightWhite: "#fff9ef"
  },
  forest: {
    background: "#07100c",
    foreground: "#dae7dd",
    cursor: "#6fd1a0",
    selectionBackground: "#1f4f3c99",
    black: "#17201c",
    red: "#d98282",
    green: "#75cb90",
    yellow: "#d8c07a",
    blue: "#7caed4",
    magenta: "#b7a0da",
    cyan: "#72d2c1",
    white: "#dae7dd",
    brightBlack: "#56665f",
    brightRed: "#eea3a3",
    brightGreen: "#96e2af",
    brightYellow: "#ecd28f",
    brightBlue: "#98c7ec",
    brightMagenta: "#d0bbee",
    brightCyan: "#8ae9d7",
    brightWhite: "#fbfff9"
  }
};

export function resolveTerminalTheme(themePreset: ThemePreset): ITheme {
  return TERMINAL_THEMES[themePreset];
}

export function applySettingsToTerminal(terminal: Terminal, settings: AppSettings) {
  terminal.options.theme = resolveTerminalTheme(settings.appearance.themePreset);
  terminal.options.fontFamily = settings.appearance.fontFamily;
  terminal.options.fontSize = settings.appearance.fontSize;
  terminal.options.lineHeight = settings.appearance.lineHeight;
  terminal.options.letterSpacing = settings.appearance.letterSpacing;
  terminal.options.cursorStyle = settings.appearance.cursorStyle;
  terminal.options.cursorBlink = settings.appearance.cursorBlink;
  terminal.options.scrollback = settings.terminal.scrollbackLines;
  (
    terminal.options as typeof terminal.options & {
      bellStyle?: "none" | "sound";
    }
  ).bellStyle = settings.terminal.bellMode === "system" ? "sound" : "none";
}

export function cloneSettings(settings: AppSettings) {
  return {
    appearance: { ...settings.appearance },
    terminal: { ...settings.terminal },
    workspace: { ...settings.workspace },
    localization: { ...settings.localization }
  } satisfies AppSettings;
}

export function createDefaultSettings() {
  return cloneSettings(DEFAULT_APP_SETTINGS);
}
