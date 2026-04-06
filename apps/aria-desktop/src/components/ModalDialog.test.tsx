// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModalDialog } from "./ModalDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("ModalDialog", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
    }

    container?.remove();
    container = null;
    root = null;
  });

  it("renders a title, symbol close button, and optional footer", () => {
    renderDialog(
      <ModalDialog
        footer={<button type="button">Close</button>}
        isOpen={true}
        onClose={() => undefined}
        title="About"
      >
        <p>Dialog content</p>
      </ModalDialog>
    );

    expect(container?.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container?.textContent).toContain("About");
    expect(container?.textContent).toContain("Dialog content");
    expect(container?.textContent).toContain("Close");
    expect(container?.querySelector('button[aria-label="Close dialog"]')).not.toBeNull();
  });

  it("omits the footer region when no footer content is provided", () => {
    renderDialog(
      <ModalDialog isOpen={true} onClose={() => undefined} title="About">
        <p>Dialog content</p>
      </ModalDialog>
    );

    expect(container?.querySelector(".dialog-modal-footer")).toBeNull();
  });

  it("closes on Escape but not on backdrop click", () => {
    const onClose = vi.fn();

    renderDialog(
      <ModalDialog isOpen={true} onClose={onClose} title="About">
        <p>Dialog content</p>
      </ModalDialog>
    );

    const backdrop = container?.querySelector(".dialog-backdrop");
    expect(backdrop).not.toBeNull();

    act(() => {
      backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  function renderDialog(node: ReactNode) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(node);
    });
  }
});
