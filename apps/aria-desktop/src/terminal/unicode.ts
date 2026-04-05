import { Unicode11Addon } from "@xterm/addon-unicode11";

type UnicodeTerminal = {
  loadAddon(addon: { dispose(): void }): void;
  unicode: {
    activeVersion: string;
    versions: readonly string[];
  };
};

export function activateUnicode11(
  terminal: UnicodeTerminal,
  addon: { dispose(): void } = new Unicode11Addon()
) {
  terminal.loadAddon(addon);

  if (terminal.unicode.versions.includes("11")) {
    terminal.unicode.activeVersion = "11";
  }
}
