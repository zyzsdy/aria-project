import type { AppSettings } from "@aria/types";
import type { ITerminalOptions } from "@xterm/xterm";

export function createTerminalOptions(settings: AppSettings): ITerminalOptions {
  return {
    allowProposedApi: true,
    cursorBlink: settings.appearance.cursorBlink,
    fontFamily: settings.appearance.fontFamily,
    fontSize: settings.appearance.fontSize,
    lineHeight: settings.appearance.lineHeight,
    letterSpacing: settings.appearance.letterSpacing,
    cursorStyle: settings.appearance.cursorStyle,
    scrollback: settings.terminal.scrollbackLines
  };
}
