import { ChevronDown } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode
} from "react";
import type {
  AppSettings,
  BellMode,
  CloseConfirmation,
  CursorStyle,
  ShellProfile,
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
  sectionProfilesLabel: {
    key: "settings.sections.profiles.label",
    defaultMessage: "Profiles"
  },
  sectionProfilesDescription: {
    key: "settings.sections.profiles.description",
    defaultMessage: "Shell launch defaults and custom profiles."
  },
  sectionProfilesHeading: {
    key: "settings.sections.profiles.heading",
    defaultMessage: "Profiles"
  },
  sectionProfilesCopy: {
    key: "settings.sections.profiles.copy",
    defaultMessage: "Manage built-in shells, add custom launch profiles, and choose the default for new sessions."
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
  fieldDefaultProfile: {
    key: "settings.fields.default_profile",
    defaultMessage: "Default profile"
  },
  fieldProfileName: {
    key: "settings.fields.profile_name",
    defaultMessage: "Profile name"
  },
  fieldExecutable: {
    key: "settings.fields.executable",
    defaultMessage: "Executable"
  },
  fieldArguments: {
    key: "settings.fields.arguments",
    defaultMessage: "Arguments"
  },
  fieldStartupDirectory: {
    key: "settings.fields.startup_directory",
    defaultMessage: "Startup directory"
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
    defaultMessage: "Copy and paste"
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
  addProfile: {
    key: "settings.actions.add_profile",
    defaultMessage: "Add profile"
  },
  deleteProfile: {
    key: "settings.actions.delete_profile",
    defaultMessage: "Delete {name}"
  },
  builtinProfile: {
    key: "settings.labels.builtin_profile",
    defaultMessage: "Built-in"
  },
  customProfile: {
    key: "settings.labels.custom_profile",
    defaultMessage: "Custom"
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
    },
    {
      id: "profiles" as const,
      label: t(SETTINGS_PAGE_MESSAGES.sectionProfilesLabel),
      description: t(SETTINGS_PAGE_MESSAGES.sectionProfilesDescription)
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
  const profileOptions = settings.profiles.items.map((profile) => ({
    value: profile.id,
    label: profile.name
  }));

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

        {selectedGroup === "profiles" ? (
          <SettingsSection
            description={t(SETTINGS_PAGE_MESSAGES.sectionProfilesCopy)}
            onReset={() => onResetGroup("profiles")}
            title={t(SETTINGS_PAGE_MESSAGES.sectionProfilesHeading)}
          >
            <div className="settings-form-grid">
              <ChoiceSelect
                label={t(SETTINGS_PAGE_MESSAGES.fieldDefaultProfile)}
                onChange={(value) =>
                  onUpdate({
                    profiles: {
                      ...settings.profiles,
                      defaultProfileId: value
                    }
                  })
                }
                options={profileOptions}
                value={settings.profiles.defaultProfileId}
              />
            </div>

            <div className="profile-card-list">
              {settings.profiles.items.map((profile) => (
                <section key={profile.id} className="profile-card">
                  <header className="profile-card-header">
                    <div>
                      <p className="settings-kicker">
                        {profile.source === "builtin"
                          ? t(SETTINGS_PAGE_MESSAGES.builtinProfile)
                          : t(SETTINGS_PAGE_MESSAGES.customProfile)}
                      </p>
                      <h3>{profile.name}</h3>
                    </div>
                    {profile.source === "custom" ? (
                      <button
                        className="settings-reset-button profile-delete-button"
                        onClick={() => onUpdate({ profiles: deleteProfile(settings, profile.id) })}
                        type="button"
                      >
                        {t(SETTINGS_PAGE_MESSAGES.deleteProfile, { name: profile.name })}
                      </button>
                    ) : null}
                  </header>

                  <div className="settings-form-grid">
                    {profile.source === "custom" ? (
                      <label className="settings-field">
                        <span>{t(SETTINGS_PAGE_MESSAGES.fieldProfileName)}</span>
                        <input
                          onChange={(event) =>
                            onUpdate({
                              profiles: updateProfile(settings, profile.id, {
                                name: event.target.value
                              })
                            })
                          }
                          type="text"
                          value={profile.name}
                        />
                      </label>
                    ) : null}
                    <label className="settings-field">
                      <span>{t(SETTINGS_PAGE_MESSAGES.fieldExecutable)}</span>
                      <input
                        onChange={(event) =>
                          onUpdate({
                            profiles: updateProfile(settings, profile.id, {
                              executable: event.target.value
                            })
                          })
                        }
                        type="text"
                        value={profile.executable}
                      />
                    </label>
                    <label className="settings-field">
                      <span>{t(SETTINGS_PAGE_MESSAGES.fieldArguments)}</span>
                      <ProfileArgumentsInput
                        onCommit={(value) =>
                          onUpdate({
                            profiles: updateProfile(settings, profile.id, {
                              args: parseArgumentList(value)
                            })
                          })
                        }
                        value={profile.args.join(" ")}
                      />
                    </label>
                    {profile.source === "custom" ? (
                      <label className="settings-field">
                        <span>{t(SETTINGS_PAGE_MESSAGES.fieldStartupDirectory)}</span>
                        <input
                          onChange={(event) =>
                            onUpdate({
                              profiles: updateProfile(settings, profile.id, {
                                startupDir: emptyStringToNull(event.target.value)
                              })
                            })
                          }
                          type="text"
                          value={profile.startupDir ?? ""}
                        />
                      </label>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>

            <div className="settings-section-actions">
              <button
                className="settings-reset-button"
                onClick={() => onUpdate({ profiles: addProfile(settings) })}
                type="button"
              >
                {t(SETTINGS_PAGE_MESSAGES.addProfile)}
              </button>
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

type ProfileArgumentsInputProps = {
  value: string;
  onCommit: (value: string) => void;
};

function ChoiceSelect({ label, options, value, onChange }: ChoiceSelectProps) {
  const fieldId = useId();
  const shellRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value]
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);
  const selectedOption = options[selectedIndex] ?? options[0];

  useEffect(() => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [selectedIndex]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || shellRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      setIsOpen(false);
      triggerRef.current?.focus();
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  function commitSelection(nextIndex: number) {
    const nextOption = options[nextIndex];
    if (!nextOption) {
      return;
    }

    onChange(nextOption.value);
    setIsOpen(false);
    setActiveIndex(nextIndex);
    triggerRef.current?.focus();
  }

  function openMenu(preferredIndex = selectedIndex >= 0 ? selectedIndex : 0) {
    setActiveIndex(preferredIndex);
    setIsOpen(true);
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case " ":
      case "Enter":
        event.preventDefault();
        if (!isOpen) {
          openMenu();
          return;
        }

        commitSelection(activeIndex);
        return;
      case "ArrowDown":
        event.preventDefault();
        if (!isOpen) {
          openMenu();
          return;
        }

        setActiveIndex((current) => Math.min(current + 1, options.length - 1));
        return;
      case "ArrowUp":
        event.preventDefault();
        if (!isOpen) {
          openMenu(selectedIndex > 0 ? selectedIndex - 1 : 0);
          return;
        }

        setActiveIndex((current) => Math.max(current - 1, 0));
        return;
      case "Home":
        if (!isOpen) {
          return;
        }

        event.preventDefault();
        setActiveIndex(0);
        return;
      case "End":
        if (!isOpen) {
          return;
        }

        event.preventDefault();
        setActiveIndex(options.length - 1);
        return;
      case "Escape":
        if (!isOpen) {
          return;
        }

        event.preventDefault();
        setIsOpen(false);
        return;
      default:
        return;
    }
  }

  return (
    <div ref={shellRef} className="settings-field choice-select">
      <span id={fieldId}>{label}</span>
      <button
        ref={triggerRef}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-labelledby={fieldId}
        className="choice-select-trigger"
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            return;
          }

          openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
        type="button"
      >
        <span>{selectedOption?.label ?? ""}</span>
        <ChevronDown aria-hidden="true" size={16} strokeWidth={1.8} />
      </button>
      {isOpen ? (
        <div
          aria-labelledby={fieldId}
          className="app-menu choice-select-menu"
          role="listbox"
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              aria-selected={option.value === value}
              className={`app-menu-item choice-select-option ${
                activeIndex === index ? "app-menu-item-active" : ""
              } ${option.value === value ? "choice-select-option-selected" : ""}`}
              onClick={() => commitSelection(index)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              type="button"
            >
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProfileArgumentsInput({ value, onCommit }: ProfileArgumentsInputProps) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  function commit() {
    onCommit(draftValue);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }

    commit();
    event.currentTarget.blur();
  }

  return (
    <input
      onBlur={commit}
      onChange={(event) => setDraftValue(event.target.value)}
      onKeyDown={handleKeyDown}
      type="text"
      value={draftValue}
    />
  );
}

function updateProfile(
  settings: AppSettings,
  profileId: string,
  updates: Partial<ShellProfile>
): AppSettings["profiles"] {
  return {
    ...settings.profiles,
    items: settings.profiles.items.map((profile) =>
      profile.id === profileId
        ? {
            ...profile,
            ...updates
          }
        : profile
    )
  };
}

function addProfile(settings: AppSettings): AppSettings["profiles"] {
  const id = createCustomProfileId(settings.profiles.items);

  return {
    defaultProfileId: settings.profiles.defaultProfileId,
    items: [
      ...settings.profiles.items,
      {
        id,
        source: "custom",
        name: "New Profile",
        executable: "",
        args: [],
        startupDir: null
      }
    ]
  };
}

function deleteProfile(settings: AppSettings, profileId: string): AppSettings["profiles"] {
  const items = settings.profiles.items.filter((profile) => profile.id !== profileId);
  const fallbackDefault = items[0]?.id ?? settings.profiles.defaultProfileId;

  return {
    defaultProfileId:
      settings.profiles.defaultProfileId === profileId
        ? fallbackDefault
        : settings.profiles.defaultProfileId,
    items
  };
}

function createCustomProfileId(profiles: readonly ShellProfile[]) {
  const existingIds = new Set(profiles.map((profile) => profile.id));
  let index = profiles.filter((profile) => profile.source === "custom").length + 1;
  let candidate = `custom:profile-${index}`;

  while (existingIds.has(candidate)) {
    index += 1;
    candidate = `custom:profile-${index}`;
  }

  return candidate;
}

function parseArgumentList(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function emptyStringToNull(value: string) {
  return value.trim() ? value : null;
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
