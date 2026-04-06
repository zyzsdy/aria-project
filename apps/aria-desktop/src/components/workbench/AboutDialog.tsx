import { useEffect, useState } from "react";
import { ModalDialog } from "../ModalDialog";
import {
  DEFAULT_ABOUT_DIALOG_STATE,
  loadAboutDialogState,
  openAboutExternalLink
} from "./aboutDialogModel";

const PROJECT_URL = "https://github.com/zyzsdy/aria-project";

type AboutDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
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
            <span>Author: Zyzsdy</span>
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
            Close
          </button>
        </>
      }
      isOpen={isOpen}
      onClose={onClose}
      title="About"
    >
      <div className="about-dialog-layout">
        <div className="about-dialog-logo-shell">
          <img
            alt="Aria Terminal logo"
            className="about-dialog-logo"
            height="128"
            src="/icon512.png"
            width="128"
          />
        </div>
        <div className="about-dialog-copy">
          <h3 className="about-dialog-product-name">Aria Terminal</h3>
          <p className="about-dialog-version-line">
            Aria Desktop version: {aboutState.desktopVersion}
          </p>
          {aboutState.webviewVersion ? (
            <p className="about-dialog-version-line">
              Webview2 version: {aboutState.webviewVersion}
            </p>
          ) : null}
          {aboutState.isAriaCoreConnected && aboutState.ariaCoreVersion ? (
            <p className="about-dialog-version-line">
              Aria Core version: {aboutState.ariaCoreVersion}
            </p>
          ) : (
            <p className="about-dialog-version-line">Aria Core not connected</p>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}
