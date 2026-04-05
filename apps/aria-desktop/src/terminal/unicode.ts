import { UnicodeGraphemesAddon } from "@xterm/addon-unicode-graphemes";
import type { ITerminalAddon, Terminal } from "@xterm/xterm";

type UnicodeTerminal = Pick<Terminal, "loadAddon">;

export function activateUnicodeGraphemes(
  terminal: UnicodeTerminal,
  addon: ITerminalAddon = new UnicodeGraphemesAddon()
) {
  terminal.loadAddon(addon);
}
