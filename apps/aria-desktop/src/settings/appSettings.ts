import type { AppSettings, ShellProfile, ThemeMode, ThemePreset } from "@aria/types";
import {
  BUILTIN_CMD_PROFILE_ID,
  BUILTIN_POWERSHELL_PROFILE_ID,
  BUILTIN_SYSTEM_PROFILE_ID,
  DEFAULT_APP_SETTINGS as DEFAULT_SHARED_APP_SETTINGS
} from "@aria/types";
import type { ITheme, Terminal } from "@xterm/xterm";

export type ThemeOption = {
  id: ThemePreset;
  category: "aria" | "classic";
};

export type DesktopPlatform = "windows" | "macos" | "linux";

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "north", category: "aria" },
  { id: "oxide", category: "aria" },
  { id: "forest", category: "aria" },
  { id: "dawn", category: "aria" },
  { id: "snow", category: "aria" },
  { id: "jade", category: "aria" },
  { id: "solarized", category: "classic" },
  { id: "gruvbox", category: "classic" },
  { id: "dracula", category: "classic" },
  { id: "monokai", category: "classic" },
  { id: "nord", category: "classic" },
  { id: "one_dark", category: "classic" },
  { id: "solarized_light", category: "classic" },
  { id: "one_light", category: "classic" },
  { id: "catppuccin_latte", category: "classic" }
];

export const DEFAULT_APP_SETTINGS = createPlatformDefaultSettings();

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
  },
  dawn: {
    background: "#faf8f5",
    foreground: "#3d3530",
    cursor: "#c4782e",
    selectionBackground: "#e8ddd088",
    black: "#3d3530",
    red: "#b83a2a",
    green: "#5a8c3a",
    yellow: "#b8860b",
    blue: "#4a7fb5",
    magenta: "#8b5e9e",
    cyan: "#3a8e8e",
    white: "#e8e0d8",
    brightBlack: "#8a7e75",
    brightRed: "#d4574a",
    brightGreen: "#7ab85a",
    brightYellow: "#daa520",
    brightBlue: "#6a9fd4",
    brightMagenta: "#a87ebc",
    brightCyan: "#5ab0b0",
    brightWhite: "#faf8f5"
  },
  snow: {
    background: "#f5f7fa",
    foreground: "#2c3038",
    cursor: "#4a8fd4",
    selectionBackground: "#c8d4e488",
    black: "#2c3038",
    red: "#c0392b",
    green: "#27ae60",
    yellow: "#d4a017",
    blue: "#2980b9",
    magenta: "#8e44ad",
    cyan: "#16a085",
    white: "#dce1e8",
    brightBlack: "#7f8c9a",
    brightRed: "#e74c3c",
    brightGreen: "#2ecc71",
    brightYellow: "#f1c40f",
    brightBlue: "#3498db",
    brightMagenta: "#9b59b6",
    brightCyan: "#1abc9c",
    brightWhite: "#f5f7fa"
  },
  jade: {
    background: "#f2f5f0",
    foreground: "#2a3328",
    cursor: "#3a9e6e",
    selectionBackground: "#c5dbc088",
    black: "#2a3328",
    red: "#a94442",
    green: "#3a7a4a",
    yellow: "#9a7a2a",
    blue: "#3a6e9e",
    magenta: "#7a5a8e",
    cyan: "#2a8a7a",
    white: "#d8e0d5",
    brightBlack: "#7a8575",
    brightRed: "#cc6666",
    brightGreen: "#5ab06a",
    brightYellow: "#bfa040",
    brightBlue: "#5a9ed4",
    brightMagenta: "#9a7ab0",
    brightCyan: "#4ab0a0",
    brightWhite: "#f2f5f0"
  },
  solarized: {
    background: "#002b36",
    foreground: "#839496",
    cursor: "#839496",
    selectionBackground: "#07364299",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#586e75",
    brightRed: "#cb4b16",
    brightGreen: "#93a1a1",
    brightYellow: "#657b83",
    brightBlue: "#839496",
    brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1",
    brightWhite: "#fdf6e3"
  },
  gruvbox: {
    background: "#282828",
    foreground: "#ebdbb2",
    cursor: "#ebdbb2",
    selectionBackground: "#50494588",
    black: "#282828",
    red: "#cc241d",
    green: "#98971a",
    yellow: "#d79921",
    blue: "#458588",
    magenta: "#b16286",
    cyan: "#689d6a",
    white: "#a89984",
    brightBlack: "#928374",
    brightRed: "#fb4934",
    brightGreen: "#b8bb26",
    brightYellow: "#fabd2f",
    brightBlue: "#83a598",
    brightMagenta: "#d3869b",
    brightCyan: "#8ec07c",
    brightWhite: "#ebdbb2"
  },
  dracula: {
    background: "#282a36",
    foreground: "#f8f8f2",
    cursor: "#f8f8f2",
    selectionBackground: "#44475a99",
    black: "#21222c",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#bd93f9",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
    white: "#f8f8f2",
    brightBlack: "#6272a4",
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#d6acff",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff"
  },
  monokai: {
    background: "#272822",
    foreground: "#f8f8f2",
    cursor: "#f8f8f0",
    selectionBackground: "#49483e99",
    black: "#272822",
    red: "#f92672",
    green: "#a6e22e",
    yellow: "#f4bf75",
    blue: "#66d9ef",
    magenta: "#ae81ff",
    cyan: "#a1efe4",
    white: "#f8f8f2",
    brightBlack: "#75715e",
    brightRed: "#f92672",
    brightGreen: "#a6e22e",
    brightYellow: "#f4bf75",
    brightBlue: "#66d9ef",
    brightMagenta: "#ae81ff",
    brightCyan: "#a1efe4",
    brightWhite: "#f9f8f5"
  },
  nord: {
    background: "#2e3440",
    foreground: "#d8dee9",
    cursor: "#d8dee9",
    selectionBackground: "#434c5e99",
    black: "#3b4252",
    red: "#bf616a",
    green: "#a3be8c",
    yellow: "#ebcb8b",
    blue: "#81a1c1",
    magenta: "#b48ead",
    cyan: "#88c0d0",
    white: "#e5e9f0",
    brightBlack: "#4c566a",
    brightRed: "#bf616a",
    brightGreen: "#a3be8c",
    brightYellow: "#ebcb8b",
    brightBlue: "#81a1c1",
    brightMagenta: "#b48ead",
    brightCyan: "#8fbcbb",
    brightWhite: "#eceff4"
  },
  "one_dark": {
    background: "#282c34",
    foreground: "#abb2bf",
    cursor: "#528bff",
    selectionBackground: "#3e445199",
    black: "#282c34",
    red: "#e06c75",
    green: "#98c379",
    yellow: "#e5c07b",
    blue: "#61afef",
    magenta: "#c678dd",
    cyan: "#56b6c2",
    white: "#abb2bf",
    brightBlack: "#5c6370",
    brightRed: "#e06c75",
    brightGreen: "#98c379",
    brightYellow: "#e5c07b",
    brightBlue: "#61afef",
    brightMagenta: "#c678dd",
    brightCyan: "#56b6c2",
    brightWhite: "#c8ccd4"
  },
  "solarized_light": {
    background: "#fdf6e3",
    foreground: "#657b83",
    cursor: "#657b83",
    selectionBackground: "#eee8d599",
    black: "#073642",
    red: "#dc322f",
    green: "#859900",
    yellow: "#b58900",
    blue: "#268bd2",
    magenta: "#d33682",
    cyan: "#2aa198",
    white: "#eee8d5",
    brightBlack: "#586e75",
    brightRed: "#cb4b16",
    brightGreen: "#93a1a1",
    brightYellow: "#839496",
    brightBlue: "#657b83",
    brightMagenta: "#6c71c4",
    brightCyan: "#93a1a1",
    brightWhite: "#fdf6e3"
  },
  "one_light": {
    background: "#fafafa",
    foreground: "#383a42",
    cursor: "#526fff",
    selectionBackground: "#bfceff88",
    black: "#383a42",
    red: "#e4564a",
    green: "#50a14f",
    yellow: "#c18401",
    blue: "#4078f2",
    magenta: "#a626a4",
    cyan: "#0184bc",
    white: "#a0a1a7",
    brightBlack: "#696c77",
    brightRed: "#e06c75",
    brightGreen: "#98c379",
    brightYellow: "#e5c07b",
    brightBlue: "#61afef",
    brightMagenta: "#c678dd",
    brightCyan: "#56b6c2",
    brightWhite: "#fafafa"
  },
  "catppuccin_latte": {
    background: "#eff1f5",
    foreground: "#4c4f69",
    cursor: "#dc8a78",
    selectionBackground: "#ccced099",
    black: "#5c5f77",
    red: "#d20f39",
    green: "#40a02b",
    yellow: "#df8e1d",
    blue: "#1e66f5",
    magenta: "#8839ef",
    cyan: "#179299",
    white: "#acb0be",
    brightBlack: "#6c6f85",
    brightRed: "#d20f39",
    brightGreen: "#40a02b",
    brightYellow: "#df8e1d",
    brightBlue: "#1e66f5",
    brightMagenta: "#8839ef",
    brightCyan: "#179299",
    brightWhite: "#bcc0cc"
  }
};

export function resolveTerminalTheme(themePreset: ThemePreset): ITheme {
  return TERMINAL_THEMES[themePreset];
}

export function resolveThemeMode(mode: ThemeMode): "light" | "dark" {
  if (mode !== "system") {
    return mode;
  }

  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  return "dark";
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
    localization: { ...settings.localization },
    profiles: {
      defaultProfileId: settings.profiles.defaultProfileId,
      items: settings.profiles.items.map((profile) => ({
        ...profile,
        args: [...profile.args]
      }))
    }
  } satisfies AppSettings;
}

export function createDefaultSettings() {
  return cloneSettings(DEFAULT_APP_SETTINGS);
}

export function createPlatformDefaultSettings(platform: DesktopPlatform = detectDesktopPlatform()) {
  return {
    ...DEFAULT_SHARED_APP_SETTINGS,
    appearance: { ...DEFAULT_SHARED_APP_SETTINGS.appearance },
    terminal: { ...DEFAULT_SHARED_APP_SETTINGS.terminal },
    workspace: { ...DEFAULT_SHARED_APP_SETTINGS.workspace },
    localization: { ...DEFAULT_SHARED_APP_SETTINGS.localization },
    profiles: createProfilesSettings(platform)
  } satisfies AppSettings;
}

export function detectDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") {
    return "windows";
  }

  const candidate =
    (
      navigator as Navigator & {
        userAgentData?: {
          platform?: string;
        };
      }
    ).userAgentData?.platform ??
    navigator.platform ??
    navigator.userAgent ??
    "";
  const normalized = candidate.toLowerCase();

  if (normalized.includes("mac")) {
    return "macos";
  }
  if (normalized.includes("linux")) {
    return "linux";
  }

  return "windows";
}

function createProfilesSettings(platform: DesktopPlatform): AppSettings["profiles"] {
  if (platform === "windows") {
    return {
      defaultProfileId: BUILTIN_POWERSHELL_PROFILE_ID,
      items: [
        createBuiltinProfile(
          BUILTIN_POWERSHELL_PROFILE_ID,
          "PowerShell",
          "powershell.exe",
          []
        ),
        createBuiltinProfile(BUILTIN_CMD_PROFILE_ID, "Command Prompt", "cmd.exe", [])
      ]
    };
  }

  return {
    defaultProfileId: BUILTIN_SYSTEM_PROFILE_ID,
    items: [createBuiltinProfile(BUILTIN_SYSTEM_PROFILE_ID, "Default Shell", "/bin/sh", [])]
  };
}

function createBuiltinProfile(
  id: string,
  name: string,
  executable: string,
  args: string[]
): ShellProfile {
  return {
    id,
    source: "builtin",
    name,
    executable,
    args,
    startupDir: null
  };
}
