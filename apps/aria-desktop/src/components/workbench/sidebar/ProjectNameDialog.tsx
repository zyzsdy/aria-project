import { useEffect, useRef, useState } from "react";
import { defineMessages } from "../../../i18n/messages";
import { useT } from "../../../i18n/react";
import { ModalDialog } from "../../ModalDialog";

const PROJECT_NAME_DIALOG_MESSAGES = defineMessages({
  createTitle: {
    key: "workbench.projects.create_dialog_title",
    defaultMessage: "Create project"
  },
  renameTitle: {
    key: "workbench.projects.rename_dialog_title",
    defaultMessage: "Rename project"
  },
  placeholder: {
    key: "workbench.projects.name_placeholder",
    defaultMessage: "Project name"
  },
  cancel: {
    key: "common.cancel",
    defaultMessage: "Cancel"
  },
  create: {
    key: "workbench.projects.create",
    defaultMessage: "Create"
  },
  rename: {
    key: "workbench.projects.rename",
    defaultMessage: "Rename"
  }
});

type ProjectNameDialogProps = {
  isOpen: boolean;
  mode: "create" | "rename";
  currentName: string;
  onClose: () => void;
  onConfirm: (name: string) => void;
};

export function ProjectNameDialog({
  isOpen,
  mode,
  currentName,
  onClose,
  onConfirm
}: ProjectNameDialogProps) {
  const t = useT();
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
    }
  }, [currentName, isOpen]);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.select();
      });
    }
  }, [isOpen]);

  function handleSubmit() {
    const trimmed = name.trim();
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
      footer={
        <>
          <button className="settings-reset-button" onClick={onClose} type="button">
            {t(PROJECT_NAME_DIALOG_MESSAGES.cancel)}
          </button>
          <button
            className="settings-reset-button"
            disabled={!name.trim()}
            onClick={handleSubmit}
            type="button"
          >
            {mode === "create"
              ? t(PROJECT_NAME_DIALOG_MESSAGES.create)
              : t(PROJECT_NAME_DIALOG_MESSAGES.rename)}
          </button>
        </>
      }
      isOpen={isOpen}
      onClose={onClose}
      title={
        mode === "create"
          ? t(PROJECT_NAME_DIALOG_MESSAGES.createTitle)
          : t(PROJECT_NAME_DIALOG_MESSAGES.renameTitle)
      }
    >
      <input
        ref={inputRef}
        className="rename-session-input"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t(PROJECT_NAME_DIALOG_MESSAGES.placeholder)}
        value={name}
      />
    </ModalDialog>
  );
}
