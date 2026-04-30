import { useEffect, useRef, useState } from "react";
import { defineMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/react";
import { ModalDialog } from "../../ModalDialog";

const RENAME_SESSION_MESSAGES = defineMessages({
  title: {
    key: "workbench.sidebar.sessions.rename_dialog_title",
    defaultMessage: "Rename Session"
  },
  placeholder: {
    key: "workbench.sidebar.sessions.rename_placeholder",
    defaultMessage: "Session name"
  },
  cancel: {
    key: "common.cancel",
    defaultMessage: "Cancel"
  },
  confirm: {
    key: "workbench.sidebar.sessions.rename",
    defaultMessage: "Rename"
  }
});

type RenameSessionDialogProps = {
  isOpen: boolean;
  currentTitle: string;
  onClose: () => void;
  onConfirm: (title: string) => void;
};

export function RenameSessionDialog({
  isOpen,
  currentTitle,
  onClose,
  onConfirm
}: RenameSessionDialogProps) {
  const t = useT();
  const [title, setTitle] = useState(currentTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(currentTitle);
    }
  }, [isOpen, currentTitle]);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.select();
      });
    }
  }, [isOpen]);

  function handleSubmit() {
    const trimmed = title.trim();
    if (trimmed) {
      onConfirm(trimmed);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  }

  return (
    <ModalDialog
      isOpen={isOpen}
      title={t(RENAME_SESSION_MESSAGES.title)}
      onClose={onClose}
      footer={
        <>
          <button
            className="settings-reset-button"
            onClick={onClose}
            type="button"
          >
            {t(RENAME_SESSION_MESSAGES.cancel)}
          </button>
          <button
            className="settings-reset-button"
            disabled={!title.trim()}
            onClick={handleSubmit}
            type="button"
          >
            {t(RENAME_SESSION_MESSAGES.confirm)}
          </button>
        </>
      }
    >
      <input
        ref={inputRef}
        className="rename-session-input"
        placeholder={t(RENAME_SESSION_MESSAGES.placeholder)}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </ModalDialog>
  );
}
