type AboutDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section aria-labelledby="about-dialog-title" aria-modal="true" className="dialog-surface" role="dialog">
        <header className="dialog-header">
          <div>
            <p className="settings-kicker">About</p>
            <h2 id="about-dialog-title">Aria Terminal</h2>
          </div>
          <button className="settings-reset-button" onClick={onClose} type="button">
            Close
          </button>
        </header>
        <p className="dialog-copy">
          Aria is a daemon-backed terminal platform with a desktop shell, shared session model,
          and room for future tool tabs and plugin-contributed UI.
        </p>
      </section>
    </div>
  );
}
