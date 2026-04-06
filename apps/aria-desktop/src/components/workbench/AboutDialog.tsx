import { useEffect, useState } from "react";
import { defineMessages } from "../../i18n/messages";
import { useT } from "../../i18n/react";
import { ModalDialog } from "../ModalDialog";
import {
  DEFAULT_ABOUT_DIALOG_STATE,
  loadAboutDialogState,
  openAboutExternalLink
} from "./aboutDialogModel";

const PROJECT_URL = "https://github.com/zyzsdy/aria-project";

const ABOUT_DIALOG_MESSAGES = defineMessages({
  title: {
    key: "dialogs.about.title",
    defaultMessage: "About"
  },
  authorLabel: {
    key: "dialogs.about.author_label",
    defaultMessage: "Author: Zyzsdy"
  },
  logoAlt: {
    key: "dialogs.about.logo_alt",
    defaultMessage: "Aria Terminal logo"
  },
  productName: {
    key: "dialogs.about.product_name",
    defaultMessage: "Aria Terminal"
  },
  desktopVersion: {
    key: "dialogs.about.desktop_version",
    defaultMessage: "Aria Desktop version: {version}"
  },
  webviewVersion: {
    key: "dialogs.about.webview_version",
    defaultMessage: "Webview2 version: {version}"
  },
  ariaCoreVersion: {
    key: "dialogs.about.aria_core_version",
    defaultMessage: "Aria Core version: {version}"
  },
  ariaCoreNotConnected: {
    key: "dialogs.about.aria_core_not_connected",
    defaultMessage: "Aria Core not connected"
  },
  close: {
    key: "common.actions.close",
    defaultMessage: "Close"
  }
});

type AboutDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const t = useT();
  const [aboutState, setAboutState] = useState(DEFAULT_ABOUT_DIALOG_STATE);

  useEffect(() => {
    if (!isOpen) {
      setAboutState(DEFAULT_ABOUT_DIALOG_STATE);
      return undefined;
    }

    let isCurrent = true;
    setAboutState(DEFAULT_ABOUT_DIALOG_STATE);

    void loadAboutDialogState().then((nextState) => {
      if (isCurrent) {
        setAboutState(nextState);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [isOpen]);

  return (
    <ModalDialog
      footer={
        <>
          <div className="about-dialog-footer-meta">
            <span>{t(ABOUT_DIALOG_MESSAGES.authorLabel)}</span>
            <a
              className="about-dialog-link"
              href={PROJECT_URL}
              onClick={(event) => {
                event.preventDefault();
                void openAboutExternalLink(PROJECT_URL);
              }}
              rel="noreferrer"
              target="_blank"
            >
              github.com/zyzsdy/aria-project
            </a>
          </div>
          <button className="settings-reset-button" onClick={onClose} type="button">
            {t(ABOUT_DIALOG_MESSAGES.close)}
          </button>
        </>
      }
      isOpen={isOpen}
      onClose={onClose}
      title={t(ABOUT_DIALOG_MESSAGES.title)}
    >
      <div className="about-dialog-layout">
        <div className="about-dialog-logo-shell">
          <img
            alt={t(ABOUT_DIALOG_MESSAGES.logoAlt)}
            className="about-dialog-logo"
            height="128"
            src="/icon512.png"
            width="128"
          />
        </div>
        <div className="about-dialog-copy">
          <h3 className="about-dialog-product-name">{t(ABOUT_DIALOG_MESSAGES.productName)}</h3>
          <p className="about-dialog-version-line">
            {t(ABOUT_DIALOG_MESSAGES.desktopVersion, { version: aboutState.desktopVersion })}
          </p>
          {aboutState.webviewVersion ? (
            <p className="about-dialog-version-line">
              {t(ABOUT_DIALOG_MESSAGES.webviewVersion, { version: aboutState.webviewVersion })}
            </p>
          ) : null}
          {aboutState.isAriaCoreConnected && aboutState.ariaCoreVersion ? (
            <p className="about-dialog-version-line">
              {t(ABOUT_DIALOG_MESSAGES.ariaCoreVersion, {
                version: aboutState.ariaCoreVersion
              })}
            </p>
          ) : (
            <p className="about-dialog-version-line">
              {t(ABOUT_DIALOG_MESSAGES.ariaCoreNotConnected)}
            </p>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}
