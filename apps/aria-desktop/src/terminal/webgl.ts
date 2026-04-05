import { WebglAddon } from "@xterm/addon-webgl";

export type ContextLossAwareAddon = {
  onContextLoss(listener: () => void): unknown;
  dispose(): void;
};

export function createWebglAddon<T extends ContextLossAwareAddon>(addon: T) {
  addon.onContextLoss(() => {
    addon.dispose();
  });

  return addon;
}

export function createDefaultWebglAddon() {
  return createWebglAddon(new WebglAddon());
}
