import { describe, expect, it, vi } from "vitest";
import * as webglModule from "./webgl";

type ContextLossAddon = {
  onContextLoss(listener: () => void): { dispose(): void };
  dispose(): void;
};

describe("createWebglAddon", () => {
  it("disposes the WebGL addon when the context is lost", () => {
    let onContextLoss: (() => void) | undefined;
    const addon: ContextLossAddon = {
      onContextLoss(listener: () => void) {
        onContextLoss = listener;
        return { dispose() {} };
      },
      dispose: vi.fn()
    };

    const createWebglAddon = (
      webglModule as Record<string, unknown>
    ).createWebglAddon as ((addon: ContextLossAddon) => ContextLossAddon) | undefined;

    expect(typeof createWebglAddon).toBe("function");
    const result = createWebglAddon?.(addon);

    expect(result).toBe(addon);
    onContextLoss?.();
    expect(addon.dispose).toHaveBeenCalledTimes(1);
  });
});
