import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { defineMessages } from "../i18n/messages";
import { useT } from "../i18n/react";

const MODAL_DIALOG_MESSAGES = defineMessages({
  close: {
    key: "dialogs.modal.close",
    defaultMessage: "Close dialog"
  }
});

type ModalDialogProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function ModalDialog({ isOpen, title, onClose, children, footer }: ModalDialogProps) {
  const t = useT();

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-label={title} aria-modal="true" className="dialog-surface" role="dialog">
        <header className="dialog-modal-header">
          <h2 className="dialog-modal-title">{title}</h2>
          <button
            aria-label={t(MODAL_DIALOG_MESSAGES.close)}
            className="dialog-icon-button"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} strokeWidth={2} />
          </button>
        </header>
        <div className="dialog-modal-body">{children}</div>
        {footer ? <footer className="dialog-modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
