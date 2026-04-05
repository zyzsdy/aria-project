import type { ReactNode } from "react";
import type {
  AppSettings,
  BellMode,
  CloseConfirmation,
  CursorStyle,
  RightClickBehavior,
  SettingsGroup,
  StartupBehavior
} from "@aria/types";
import { BELL_MODES, CLOSE_CONFIRMATIONS, CURSOR_STYLES, RIGHT_CLICK_BEHAVIORS, STARTUP_BEHAVIORS } from "@aria/types";
import { THEME_OPTIONS } from "./appSettings";

type SettingsPageProps = {
  selectedGroup: SettingsGroup;
  settings: AppSettings;
  onSelectGroup: (group: SettingsGroup) => void;
  onUpdate: (next: Partial<AppSettings>) => void;
  onResetGroup: (group: SettingsGroup) => void;
};

const SETTINGS_SECTIONS: Array<{ id: SettingsGroup; label: string; description: string }> = [
  { id: "appearance", label: "Appearance", description: "Theme, font, and cursor tuning." },
  { id: "terminal", label: "Terminal", description: "Scrollback and interaction defaults." },
  { id: "workspace", label: "Workspace", description: "Launch and close behavior." }
];

export function SettingsPage({
  selectedGroup,
  settings,
  onSelectGroup,
  onUpdate,
  onResetGroup
}: SettingsPageProps) {
  return (
    <section className="settings-page">
      <aside className="settings-sidebar" aria-label="Settings sections">
        <p className="settings-kicker">Workspace Settings</p>
        {SETTINGS_SECTIONS.map((section) => (
          <button
            key={section.id}
            className={`settings-nav-button ${selectedGroup === section.id ? "settings-nav-button-active" : ""}`}
            onClick={() => onSelectGroup(section.id)}
            type="button"
          >
            <strong>{section.label}</strong>
            <span>{section.description}</span>
          </button>
        ))}
      </aside>

      <div className="settings-content">
        {selectedGroup === "appearance" ? (
          <SettingsSection
            description="Adjust how the terminal and shell look right now."
            onReset={() => onResetGroup("appearance")}
            title="Appearance"
          >
            <div className="theme-card-grid">
              {THEME_OPTIONS.map((theme) => (
                <button
                  key={theme.id}
                  className={`theme-card ${settings.appearance.themePreset === theme.id ? "theme-card-active" : ""}`}
                  onClick={() =>
                    onUpdate({
                      appearance: {
                        ...settings.appearance,
                        themePreset: theme.id
                      }
                    })
                  }
                  type="button"
                >
                  <span className={`theme-card-preview theme-card-preview-${theme.id}`} />
                  <strong>{theme.label}</strong>
                  <span>{theme.blurb}</span>
                </button>
              ))}
            </div>

            <div className="settings-form-grid">
              <label className="settings-field">
                <span>Font family</span>
                <input
                  onChange={(event) =>
                    onUpdate({
                      appearance: {
                        ...settings.appearance,
                        fontFamily: event.target.value
                      }
                    })
                  }
                  type="text"
                  value={settings.appearance.fontFamily}
                />
              </label>
              <label className="settings-field">
                <span>Font size</span>
                <input
                  min={10}
                  onChange={(event) =>
                    onUpdate({
                      appearance: {
                        ...settings.appearance,
                        fontSize: Number(event.target.value)
                      }
                    })
                  }
                  type="number"
                  value={settings.appearance.fontSize}
                />
              </label>
              <label className="settings-field">
                <span>Line height</span>
                <input
                  max={2}
                  min={1}
                  onChange={(event) =>
                    onUpdate({
                      appearance: {
                        ...settings.appearance,
                        lineHeight: Number(event.target.value)
                      }
                    })
                  }
                  step={0.1}
                  type="number"
                  value={settings.appearance.lineHeight}
                />
              </label>
              <label className="settings-field">
                <span>Letter spacing</span>
                <input
                  max={4}
                  min={-2}
                  onChange={(event) =>
                    onUpdate({
                      appearance: {
                        ...settings.appearance,
                        letterSpacing: Number(event.target.value)
                      }
                    })
                  }
                  type="number"
                  value={settings.appearance.letterSpacing}
                />
              </label>
              <ChoiceSelect
                label="Cursor style"
                onChange={(value) =>
                  onUpdate({
                    appearance: {
                      ...settings.appearance,
                      cursorStyle: value as CursorStyle
                    }
                  })
                }
                options={CURSOR_STYLES}
                value={settings.appearance.cursorStyle}
              />
              <label className="settings-checkbox">
                <input
                  checked={settings.appearance.cursorBlink}
                  onChange={(event) =>
                    onUpdate({
                      appearance: {
                        ...settings.appearance,
                        cursorBlink: event.target.checked
                      }
                    })
                  }
                  type="checkbox"
                />
                <span>Cursor blinks</span>
              </label>
            </div>
          </SettingsSection>
        ) : null}

        {selectedGroup === "terminal" ? (
          <SettingsSection
            description="Set terminal interaction defaults and history limits."
            onReset={() => onResetGroup("terminal")}
            title="Terminal"
          >
            <div className="settings-form-grid">
              <label className="settings-field">
                <span>Scrollback lines</span>
                <input
                  min={500}
                  onChange={(event) =>
                    onUpdate({
                      terminal: {
                        ...settings.terminal,
                        scrollbackLines: Number(event.target.value)
                      }
                    })
                  }
                  step={100}
                  type="number"
                  value={settings.terminal.scrollbackLines}
                />
              </label>
              <ChoiceSelect
                label="Right click"
                onChange={(value) =>
                  onUpdate({
                    terminal: {
                      ...settings.terminal,
                      rightClickBehavior: value as RightClickBehavior
                    }
                  })
                }
                options={RIGHT_CLICK_BEHAVIORS}
                value={settings.terminal.rightClickBehavior}
              />
              <ChoiceSelect
                label="Bell mode"
                onChange={(value) =>
                  onUpdate({
                    terminal: {
                      ...settings.terminal,
                      bellMode: value as BellMode
                    }
                  })
                }
                options={BELL_MODES}
                value={settings.terminal.bellMode}
              />
              <label className="settings-checkbox">
                <input
                  checked={settings.terminal.copyOnSelect}
                  onChange={(event) =>
                    onUpdate({
                      terminal: {
                        ...settings.terminal,
                        copyOnSelect: event.target.checked
                      }
                    })
                  }
                  type="checkbox"
                />
                <span>Copy on select</span>
              </label>
            </div>
          </SettingsSection>
        ) : null}

        {selectedGroup === "workspace" ? (
          <SettingsSection
            description="Choose what the app restores and how it handles closing active work."
            onReset={() => onResetGroup("workspace")}
            title="Workspace"
          >
            <div className="settings-form-grid">
              <ChoiceSelect
                label="Startup behavior"
                onChange={(value) =>
                  onUpdate({
                    workspace: {
                      ...settings.workspace,
                      startupBehavior: value as StartupBehavior
                    }
                  })
                }
                options={STARTUP_BEHAVIORS}
                value={settings.workspace.startupBehavior}
              />
              <ChoiceSelect
                label="Close confirmation"
                onChange={(value) =>
                  onUpdate({
                    workspace: {
                      ...settings.workspace,
                      closeConfirmation: value as CloseConfirmation
                    }
                  })
                }
                options={CLOSE_CONFIRMATIONS}
                value={settings.workspace.closeConfirmation}
              />
            </div>
          </SettingsSection>
        ) : null}
      </div>
    </section>
  );
}

type SettingsSectionProps = {
  title: string;
  description: string;
  onReset: () => void;
  children: ReactNode;
};

function SettingsSection({ title, description, onReset, children }: SettingsSectionProps) {
  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <div>
          <p className="settings-kicker">{title}</p>
          <h2>{title}</h2>
          <p className="settings-section-copy">{description}</p>
        </div>
        <button className="settings-reset-button" onClick={onReset} type="button">
          Reset to defaults
        </button>
      </header>
      {children}
    </section>
  );
}

type ChoiceSelectProps = {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
};

function ChoiceSelect({ label, options, value, onChange }: ChoiceSelectProps) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}
