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
import {
  BELL_MODES,
  CLOSE_CONFIRMATIONS,
  CURSOR_STYLES,
  RIGHT_CLICK_BEHAVIORS,
  STARTUP_BEHAVIORS
} from "@aria/types";
import { defineMessages } from "../i18n/messages";
import { useI18n, useT } from "../i18n/react";
import { THEME_OPTIONS } from "./appSettings";

type SettingsPageProps = {
  selectedGroup: SettingsGroup;
  settings: AppSettings;
  onSelectGroup: (group: SettingsGroup) => void;
  onUpdate: (next: Partial<AppSettings>) => void;
  onResetGroup: (group: SettingsGroup) => void;
};

type ChoiceOption = {
  value: string;
  label: string;
};

const SETTINGS_PAGE_MESSAGES = defineMessages({
  sectionsAriaLabel: {
    key: "settings.page.sections_aria_label",
    defaultMessage: "Settings sections"
  },
  kicker: {
    key: "settings.page.kicker",
    defaultMessage: "Workspace Settings"
  },
  sectionAppearanceLabel: {
    key: "settings.sections.appearance.label",
    defaultMessage: "Appearance"
  },
  sectionAppearanceDescription: {
    key: "settings.sections.appearance.description",
    defaultMessage: "Theme, font, and cursor tuning."
  },
  sectionAppearanceHeading: {
    key: "settings.sections.appearance.heading",
    defaultMessage: "Appearance"
  },
  sectionAppearanceCopy: {
    key: "settings.sections.appearance.copy",
    defaultMessage: "Adjust how the terminal and shell look right now."
  },
  sectionTerminalLabel: {
    key: "settings.sections.terminal.label",
    defaultMessage: "Terminal"
  },
  sectionTerminalDescription: {
    key: "settings.sections.terminal.description",
    defaultMessage: "Scrollback and interaction defaults."
  },
  sectionTerminalHeading: {
    key: "settings.sections.terminal.heading",
    defaultMessage: "Terminal"
  },
  sectionTerminalCopy: {
    key: "settings.sections.terminal.copy",
    defaultMessage: "Set terminal interaction defaults and history limits."
  },
  sectionWorkspaceLabel: {
    key: "settings.sections.workspace.label",
    defaultMessage: "Workspace"
  },
  sectionWorkspaceDescription: {
    key: "settings.sections.workspace.description",
    defaultMessage: "Launch and close behavior."
  },
  sectionWorkspaceHeading: {
    key: "settings.sections.workspace.heading",
    defaultMessage: "Workspace"
  },
  sectionWorkspaceCopy: {
    key: "settings.sections.workspace.copy",
    defaultMessage: "Choose what the app restores and how it handles closing active work."
  },
  sectionLocalizationLabel: {
    key: "settings.sections.localization.label",
    defaultMessage: "Localization"
  },
  sectionLocalizationDescription: {
    key: "settings.sections.localization.description",
    defaultMessage: "Language and locale preferences."
  },
  sectionLocalizationHeading: {
    key: "settings.sections.localization.heading",
    defaultMessage: "Localization"
  },
  sectionLocalizationCopy: {
    key: "settings.sections.localization.copy",
    defaultMessage: "Choose the language used by the desktop shell."
  },
  fieldFontFamily: {
    key: "settings.fields.font_family",
    defaultMessage: "Font family"
  },
  fieldFontSize: {
    key: "settings.fields.font_size",
    defaultMessage: "Font size"
  },
  fieldLineHeight: {
    key: "settings.fields.line_height",
    defaultMessage: "Line height"
  },
  fieldLetterSpacing: {
    key: "settings.fields.letter_spacing",
    defaultMessage: "Letter spacing"
  },
  fieldCursorStyle: {
    key: "settings.fields.cursor_style",
    defaultMessage: "Cursor style"
  },
  fieldCursorBlinks: {
    key: "settings.fields.cursor_blinks",
    defaultMessage: "Cursor blinks"
  },
  fieldScrollbackLines: {
    key: "settings.fields.scrollback_lines",
    defaultMessage: "Scrollback lines"
  },
  fieldRightClick: {
    key: "settings.fields.right_click",
    defaultMessage: "Right click"
  },
  fieldBellMode: {
    key: "settings.fields.bell_mode",
    defaultMessage: "Bell mode"
  },
  fieldCopyOnSelect: {
    key: "settings.fields.copy_on_select",
    defaultMessage: "Copy on select"
  },
  fieldStartupBehavior: {
    key: "settings.fields.startup_behavior",
    defaultMessage: "Startup behavior"
  },
  fieldCloseConfirmation: {
    key: "settings.fields.close_confirmation",
    defaultMessage: "Close confirmation"
  },
  fieldLanguage: {
    key: "settings.fields.language",
    defaultMessage: "Language"
  },
  themeNorthLabel: {
    key: "settings.themes.north.label",
    defaultMessage: "North"
  },
  themeNorthBlurb: {
    key: "settings.themes.north.blurb",
    defaultMessage: "Cold blue contrast for dense terminal work."
  },
  themeOxideLabel: {
    key: "settings.themes.oxide.label",
    defaultMessage: "Oxide"
  },
  themeOxideBlurb: {
    key: "settings.themes.oxide.blurb",
    defaultMessage: "Warm amber neutrals with softer glow."
  },
  themeForestLabel: {
    key: "settings.themes.forest.label",
    defaultMessage: "Forest"
  },
  themeForestBlurb: {
    key: "settings.themes.forest.blurb",
    defaultMessage: "Muted green palette with calmer focus."
  },
  cursorStyleBlock: {
    key: "settings.options.cursor_style.block",
    defaultMessage: "Block"
  },
  cursorStyleUnderline: {
    key: "settings.options.cursor_style.underline",
    defaultMessage: "Underline"
  },
  cursorStyleBar: {
    key: "settings.options.cursor_style.bar",
    defaultMessage: "Bar"
  },
  rightClickPaste: {
    key: "settings.options.right_click.paste",
    defaultMessage: "Paste"
  },
  rightClickMenu: {
    key: "settings.options.right_click.menu",
    defaultMessage: "Menu"
  },
  bellModeOff: {
    key: "settings.options.bell_mode.off",
    defaultMessage: "Off"
  },
  bellModeVisual: {
    key: "settings.options.bell_mode.visual",
    defaultMessage: "Visual"
  },
  bellModeSystem: {
    key: "settings.options.bell_mode.system",
    defaultMessage: "System"
  },
  startupOpenEmpty: {
    key: "settings.options.startup_behavior.open_empty",
    defaultMessage: "Open empty"
  },
  startupRestorePrevious: {
    key: "settings.options.startup_behavior.restore_previous",
    defaultMessage: "Restore previous"
  },
  closeNever: {
    key: "settings.options.close_confirmation.never",
    defaultMessage: "Never"
  },
  closeConfirmRunningSessions: {
    key: "settings.options.close_confirmation.confirm_running_sessions",
    defaultMessage: "Confirm with running sessions"
  },
  localeSystem: {
    key: "settings.options.locale.system",
    defaultMessage: "Use system language"
  },
  localeEn: {
    key: "settings.options.locale.en",
    defaultMessage: "English"
  },
  localeZhCn: {
    key: "settings.options.locale.zh_cn",
    defaultMessage: "Simplified Chinese"
  },
  localeJa: {
    key: "settings.options.locale.ja",
    defaultMessage: "Japanese"
  },
  resetToDefaults: {
    key: "common.actions.reset_to_defaults",
    defaultMessage: "Reset to defaults"
  }
});

export function SettingsPage({
  selectedGroup,
  settings,
  onSelectGroup,
  onUpdate,
  onResetGroup
}: SettingsPageProps) {
  const t = useT();
  const { availableLocales } = useI18n();
  const sections = [
    {
      id: "appearance" as const,
      label: t(SETTINGS_PAGE_MESSAGES.sectionAppearanceLabel),
      description: t(SETTINGS_PAGE_MESSAGES.sectionAppearanceDescription)
    },
    {
      id: "terminal" as const,
      label: t(SETTINGS_PAGE_MESSAGES.sectionTerminalLabel),
      description: t(SETTINGS_PAGE_MESSAGES.sectionTerminalDescription)
    },
    {
      id: "workspace" as const,
      label: t(SETTINGS_PAGE_MESSAGES.sectionWorkspaceLabel),
      description: t(SETTINGS_PAGE_MESSAGES.sectionWorkspaceDescription)
    },
    {
      id: "localization" as const,
      label: t(SETTINGS_PAGE_MESSAGES.sectionLocalizationLabel),
      description: t(SETTINGS_PAGE_MESSAGES.sectionLocalizationDescription)
    }
  ];
  const themeCopy = {
    north: {
      label: t(SETTINGS_PAGE_MESSAGES.themeNorthLabel),
      blurb: t(SETTINGS_PAGE_MESSAGES.themeNorthBlurb)
    },
    oxide: {
      label: t(SETTINGS_PAGE_MESSAGES.themeOxideLabel),
      blurb: t(SETTINGS_PAGE_MESSAGES.themeOxideBlurb)
    },
    forest: {
      label: t(SETTINGS_PAGE_MESSAGES.themeForestLabel),
      blurb: t(SETTINGS_PAGE_MESSAGES.themeForestBlurb)
    }
  } as const;
  const cursorStyleOptions = mapOptions(CURSOR_STYLES, {
    block: t(SETTINGS_PAGE_MESSAGES.cursorStyleBlock),
    underline: t(SETTINGS_PAGE_MESSAGES.cursorStyleUnderline),
    bar: t(SETTINGS_PAGE_MESSAGES.cursorStyleBar)
  });
  const rightClickOptions = mapOptions(RIGHT_CLICK_BEHAVIORS, {
    paste: t(SETTINGS_PAGE_MESSAGES.rightClickPaste),
    menu: t(SETTINGS_PAGE_MESSAGES.rightClickMenu)
  });
  const bellModeOptions = mapOptions(BELL_MODES, {
    off: t(SETTINGS_PAGE_MESSAGES.bellModeOff),
    visual: t(SETTINGS_PAGE_MESSAGES.bellModeVisual),
    system: t(SETTINGS_PAGE_MESSAGES.bellModeSystem)
  });
  const startupOptions = mapOptions(STARTUP_BEHAVIORS, {
    open_empty: t(SETTINGS_PAGE_MESSAGES.startupOpenEmpty),
    restore_previous: t(SETTINGS_PAGE_MESSAGES.startupRestorePrevious)
  });
  const closeConfirmationOptions = mapOptions(CLOSE_CONFIRMATIONS, {
    never: t(SETTINGS_PAGE_MESSAGES.closeNever),
    confirm_running_sessions: t(SETTINGS_PAGE_MESSAGES.closeConfirmRunningSessions)
  });
  const languageOptions = [
    { value: "system", label: t(SETTINGS_PAGE_MESSAGES.localeSystem) },
    ...availableLocales.map((locale) => ({
      value: locale,
      label: getLocaleLabel(locale, t)
    }))
  ];

  return (
    <section className="settings-page">
      <aside className="settings-sidebar" aria-label={t(SETTINGS_PAGE_MESSAGES.sectionsAriaLabel)}>
        <p className="settings-kicker">{t(SETTINGS_PAGE_MESSAGES.kicker)}</p>
        {sections.map((section) => (
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
            description={t(SETTINGS_PAGE_MESSAGES.sectionAppearanceCopy)}
            onReset={() => onResetGroup("appearance")}
            title={t(SETTINGS_PAGE_MESSAGES.sectionAppearanceHeading)}
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
                  <strong>{themeCopy[theme.id].label}</strong>
                  <span>{themeCopy[theme.id].blurb}</span>
                </button>
              ))}
            </div>

            <div className="settings-form-grid">
              <label className="settings-field">
                <span>{t(SETTINGS_PAGE_MESSAGES.fieldFontFamily)}</span>
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
                <span>{t(SETTINGS_PAGE_MESSAGES.fieldFontSize)}</span>
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
                <span>{t(SETTINGS_PAGE_MESSAGES.fieldLineHeight)}</span>
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
                <span>{t(SETTINGS_PAGE_MESSAGES.fieldLetterSpacing)}</span>
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
                label={t(SETTINGS_PAGE_MESSAGES.fieldCursorStyle)}
                onChange={(value) =>
                  onUpdate({
                    appearance: {
                      ...settings.appearance,
                      cursorStyle: value as CursorStyle
                    }
                  })
                }
                options={cursorStyleOptions}
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
                <span>{t(SETTINGS_PAGE_MESSAGES.fieldCursorBlinks)}</span>
              </label>
            </div>
          </SettingsSection>
        ) : null}

        {selectedGroup === "terminal" ? (
          <SettingsSection
            description={t(SETTINGS_PAGE_MESSAGES.sectionTerminalCopy)}
            onReset={() => onResetGroup("terminal")}
            title={t(SETTINGS_PAGE_MESSAGES.sectionTerminalHeading)}
          >
            <div className="settings-form-grid">
              <label className="settings-field">
                <span>{t(SETTINGS_PAGE_MESSAGES.fieldScrollbackLines)}</span>
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
                label={t(SETTINGS_PAGE_MESSAGES.fieldRightClick)}
                onChange={(value) =>
                  onUpdate({
                    terminal: {
                      ...settings.terminal,
                      rightClickBehavior: value as RightClickBehavior
                    }
                  })
                }
                options={rightClickOptions}
                value={settings.terminal.rightClickBehavior}
              />
              <ChoiceSelect
                label={t(SETTINGS_PAGE_MESSAGES.fieldBellMode)}
                onChange={(value) =>
                  onUpdate({
                    terminal: {
                      ...settings.terminal,
                      bellMode: value as BellMode
                    }
                  })
                }
                options={bellModeOptions}
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
                <span>{t(SETTINGS_PAGE_MESSAGES.fieldCopyOnSelect)}</span>
              </label>
            </div>
          </SettingsSection>
        ) : null}

        {selectedGroup === "workspace" ? (
          <SettingsSection
            description={t(SETTINGS_PAGE_MESSAGES.sectionWorkspaceCopy)}
            onReset={() => onResetGroup("workspace")}
            title={t(SETTINGS_PAGE_MESSAGES.sectionWorkspaceHeading)}
          >
            <div className="settings-form-grid">
              <ChoiceSelect
                label={t(SETTINGS_PAGE_MESSAGES.fieldStartupBehavior)}
                onChange={(value) =>
                  onUpdate({
                    workspace: {
                      ...settings.workspace,
                      startupBehavior: value as StartupBehavior
                    }
                  })
                }
                options={startupOptions}
                value={settings.workspace.startupBehavior}
              />
              <ChoiceSelect
                label={t(SETTINGS_PAGE_MESSAGES.fieldCloseConfirmation)}
                onChange={(value) =>
                  onUpdate({
                    workspace: {
                      ...settings.workspace,
                      closeConfirmation: value as CloseConfirmation
                    }
                  })
                }
                options={closeConfirmationOptions}
                value={settings.workspace.closeConfirmation}
              />
            </div>
          </SettingsSection>
        ) : null}

        {selectedGroup === "localization" ? (
          <SettingsSection
            description={t(SETTINGS_PAGE_MESSAGES.sectionLocalizationCopy)}
            onReset={() => onResetGroup("localization")}
            title={t(SETTINGS_PAGE_MESSAGES.sectionLocalizationHeading)}
          >
            <div className="settings-form-grid">
              <ChoiceSelect
                label={t(SETTINGS_PAGE_MESSAGES.fieldLanguage)}
                onChange={(value) =>
                  onUpdate({
                    localization: {
                      ...settings.localization,
                      locale: value
                    }
                  })
                }
                options={languageOptions}
                value={settings.localization.locale}
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
  const t = useT();

  return (
    <section className="settings-section">
      <header className="settings-section-header">
        <div>
          <p className="settings-kicker">{title}</p>
          <h2>{title}</h2>
          <p className="settings-section-copy">{description}</p>
        </div>
        <button className="settings-reset-button" onClick={onReset} type="button">
          {t(SETTINGS_PAGE_MESSAGES.resetToDefaults)}
        </button>
      </header>
      {children}
    </section>
  );
}

type ChoiceSelectProps = {
  label: string;
  options: readonly ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
};

function ChoiceSelect({ label, options, value, onChange }: ChoiceSelectProps) {
  return (
    <label className="settings-field">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function mapOptions<T extends string>(values: readonly T[], labels: Record<T, string>) {
  return values.map((value) => ({
    value,
    label: labels[value]
  }));
}

function getLocaleLabel(locale: string, t: ReturnType<typeof useT>) {
  switch (locale) {
    case "en":
      return t(SETTINGS_PAGE_MESSAGES.localeEn);
    case "zh-CN":
      return t(SETTINGS_PAGE_MESSAGES.localeZhCn);
    case "ja":
      return t(SETTINGS_PAGE_MESSAGES.localeJa);
    default:
      return locale;
  }
}
