use anyhow::{Context, Result};
use aria_ipc::{
    platform_builtin_profiles, platform_default_profile_id, AppSettings, AppearanceSettings,
    LocalizationSettings, ProfileSource, ProfilesSettings, ResetSettingsGroupRequest,
    SettingsGroup, ShellProfile, TerminalSettings, UpdateAppSettingsPayload, UpdateSettingsRequest,
    WorkspaceSettings,
};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
};
use tokio::sync::RwLock;

pub struct SettingsStore {
    path: PathBuf,
    settings: RwLock<AppSettings>,
}

impl SettingsStore {
    pub fn load(path: impl Into<PathBuf>) -> Result<Self> {
        let path = path.into();
        let settings = load_settings_file(&path)?;

        Ok(Self {
            path,
            settings: RwLock::new(settings),
        })
    }

    pub async fn get(&self) -> AppSettings {
        self.settings.read().await.clone()
    }

    pub async fn update(&self, request: UpdateSettingsRequest) -> Result<AppSettings> {
        let mut settings = self.settings.write().await;
        apply_settings_patch(&mut settings, &request.settings);
        save_settings_file(&self.path, &settings)?;
        Ok(settings.clone())
    }

    pub async fn reset_group(&self, request: ResetSettingsGroupRequest) -> Result<AppSettings> {
        let mut settings = self.settings.write().await;
        reset_settings_group(&mut settings, request.group);
        save_settings_file(&self.path, &settings)?;
        Ok(settings.clone())
    }
}

fn load_settings_file(path: &Path) -> Result<AppSettings> {
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let contents = fs::read_to_string(path)
        .with_context(|| format!("read settings file {}", path.display()))?;

    let mut settings: AppSettings = toml::from_str(&contents)
        .with_context(|| format!("parse settings file {}", path.display()))?;
    reconcile_app_settings(&mut settings);
    Ok(settings)
}

fn save_settings_file(path: &Path, settings: &AppSettings) -> Result<()> {
    let contents = toml::to_string_pretty(settings).context("serialize app settings")?;
    fs::write(path, contents).with_context(|| format!("write settings file {}", path.display()))
}

fn apply_settings_patch(settings: &mut AppSettings, patch: &UpdateAppSettingsPayload) {
    if let Some(appearance) = &patch.appearance {
        if let Some(theme_preset) = appearance.theme_preset {
            settings.appearance.theme_preset = theme_preset;
        }
        if let Some(font_family) = &appearance.font_family {
            settings.appearance.font_family = font_family.clone();
        }
        if let Some(font_size) = appearance.font_size {
            settings.appearance.font_size = font_size;
        }
        if let Some(line_height) = appearance.line_height {
            settings.appearance.line_height = line_height;
        }
        if let Some(letter_spacing) = appearance.letter_spacing {
            settings.appearance.letter_spacing = letter_spacing;
        }
        if let Some(cursor_style) = appearance.cursor_style {
            settings.appearance.cursor_style = cursor_style;
        }
        if let Some(cursor_blink) = appearance.cursor_blink {
            settings.appearance.cursor_blink = cursor_blink;
        }
    }

    if let Some(terminal) = &patch.terminal {
        if let Some(scrollback_lines) = terminal.scrollback_lines {
            settings.terminal.scrollback_lines = scrollback_lines;
        }
        if let Some(right_click_behavior) = terminal.right_click_behavior {
            settings.terminal.right_click_behavior = right_click_behavior;
        }
        if let Some(bell_mode) = terminal.bell_mode {
            settings.terminal.bell_mode = bell_mode;
        }
    }

    if let Some(workspace) = &patch.workspace {
        if let Some(startup_behavior) = workspace.startup_behavior {
            settings.workspace.startup_behavior = startup_behavior;
        }
        if let Some(close_confirmation) = workspace.close_confirmation {
            settings.workspace.close_confirmation = close_confirmation;
        }
    }

    if let Some(localization) = &patch.localization {
        if let Some(locale) = &localization.locale {
            settings.localization.locale = locale.clone();
        }
    }

    if let Some(profiles) = &patch.profiles {
        if let Some(default_profile_id) = &profiles.default_profile_id {
            settings.profiles.default_profile_id = default_profile_id.clone();
        }
        if let Some(items) = &profiles.items {
            settings.profiles.items = items.clone();
        }
    }

    reconcile_app_settings(settings);
}

fn reset_settings_group(settings: &mut AppSettings, group: SettingsGroup) {
    match group {
        SettingsGroup::Appearance => {
            settings.appearance = AppearanceSettings::default();
        }
        SettingsGroup::Terminal => {
            settings.terminal = TerminalSettings::default();
        }
        SettingsGroup::Workspace => {
            settings.workspace = WorkspaceSettings::default();
        }
        SettingsGroup::Localization => {
            settings.localization = LocalizationSettings::default();
        }
        SettingsGroup::Profiles => {
            settings.profiles = ProfilesSettings::default();
        }
    }
}

fn reconcile_app_settings(settings: &mut AppSettings) {
    settings.profiles = reconcile_profiles(&settings.profiles);
}

fn reconcile_profiles(profiles: &ProfilesSettings) -> ProfilesSettings {
    let builtin_ids: Vec<String> = platform_builtin_profiles()
        .iter()
        .map(|profile| profile.id.clone())
        .collect();
    let existing_by_id: HashMap<&str, &ShellProfile> = profiles
        .items
        .iter()
        .map(|profile| (profile.id.as_str(), profile))
        .collect();

    let mut items = platform_builtin_profiles()
        .into_iter()
        .map(|builtin| match existing_by_id.get(builtin.id.as_str()) {
            Some(existing) => ShellProfile {
                id: builtin.id,
                source: ProfileSource::Builtin,
                name: builtin.name,
                executable: existing.executable.clone(),
                args: existing.args.clone(),
                startup_dir: None,
            },
            None => builtin,
        })
        .collect::<Vec<_>>();

    items.extend(
        profiles
            .items
            .iter()
            .filter(|profile| {
                !builtin_ids
                    .iter()
                    .any(|builtin_id| builtin_id == &profile.id)
            })
            .map(|profile| ShellProfile {
                id: profile.id.clone(),
                source: ProfileSource::Custom,
                name: profile.name.clone(),
                executable: profile.executable.clone(),
                args: profile.args.clone(),
                startup_dir: profile.startup_dir.clone(),
            }),
    );

    let default_profile_id = if items
        .iter()
        .any(|profile| profile.id == profiles.default_profile_id)
    {
        profiles.default_profile_id.clone()
    } else {
        platform_default_profile_id().to_string()
    };

    ProfilesSettings {
        default_profile_id,
        items,
    }
}

#[cfg(test)]
mod tests {
    use super::{apply_settings_patch, load_settings_file, reset_settings_group, SettingsStore};
    use aria_ipc::{
        platform_builtin_profiles, platform_default_profile_id, AppSettings,
        AppearanceSettingsPatch, LocalizationSettingsPatch, ProfileSource, ProfilesSettings,
        ProfilesSettingsPatch, SettingsGroup, ShellProfile, TerminalSettingsPatch,
        UpdateAppSettingsPayload, WorkspaceSettingsPatch,
    };
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn apply_settings_patch_updates_only_requested_fields() {
        let mut settings = AppSettings::default();

        apply_settings_patch(
            &mut settings,
            &UpdateAppSettingsPayload {
                appearance: Some(AppearanceSettingsPatch {
                    font_size: Some(16),
                    ..AppearanceSettingsPatch::default()
                }),
                terminal: Some(TerminalSettingsPatch {
                    bell_mode: Some(aria_ipc::BellMode::Visual),
                    ..TerminalSettingsPatch::default()
                }),
                workspace: Some(WorkspaceSettingsPatch {
                    close_confirmation: Some(aria_ipc::CloseConfirmation::Never),
                    ..WorkspaceSettingsPatch::default()
                }),
                localization: Some(LocalizationSettingsPatch {
                    locale: Some("ja-JP".to_string()),
                }),
                profiles: Some(ProfilesSettingsPatch {
                    default_profile_id: Some("custom:fish".to_string()),
                    items: Some(vec![ShellProfile {
                        id: "custom:fish".to_string(),
                        source: ProfileSource::Custom,
                        name: "Fish".to_string(),
                        executable: "fish".to_string(),
                        args: vec!["--login".to_string()],
                        startup_dir: Some("/tmp".to_string()),
                    }]),
                }),
            },
        );

        assert_eq!(settings.appearance.font_size, 16);
        assert_eq!(settings.terminal.bell_mode, aria_ipc::BellMode::Visual);
        assert_eq!(
            settings.workspace.close_confirmation,
            aria_ipc::CloseConfirmation::Never
        );
        assert_eq!(settings.localization.locale, "ja-JP");
        assert_eq!(
            settings.appearance.theme_preset,
            aria_ipc::ThemePreset::North
        );
        assert_eq!(settings.profiles.default_profile_id, "custom:fish");
        assert!(settings
            .profiles
            .items
            .iter()
            .any(|profile| profile.id == "custom:fish"));
        assert!(platform_builtin_profiles().iter().all(|profile| settings
            .profiles
            .items
            .iter()
            .any(|existing| existing.id == profile.id)));
    }

    #[test]
    fn reset_settings_group_restores_only_the_requested_group() {
        let mut settings = AppSettings::default();
        settings.appearance.font_size = 16;
        settings.terminal.scrollback_lines = 5_000;
        settings.localization.locale = "ja-JP".to_string();
        settings.profiles = ProfilesSettings {
            default_profile_id: "custom:fish".to_string(),
            items: vec![ShellProfile {
                id: "custom:fish".to_string(),
                source: ProfileSource::Custom,
                name: "Fish".to_string(),
                executable: "fish".to_string(),
                args: Vec::new(),
                startup_dir: Some("/tmp".to_string()),
            }],
        };

        reset_settings_group(&mut settings, SettingsGroup::Localization);

        assert_eq!(
            settings.localization,
            aria_ipc::LocalizationSettings::default()
        );
        assert_eq!(settings.terminal.scrollback_lines, 5_000);
        assert_eq!(settings.profiles.default_profile_id, "custom:fish");
    }

    #[test]
    fn load_settings_file_repairs_profile_defaults_and_missing_builtins() {
        let path = temp_settings_path("load");
        let settings = AppSettings {
            profiles: ProfilesSettings {
                default_profile_id: "missing".to_string(),
                items: vec![ShellProfile {
                    id: "custom:nu".to_string(),
                    source: ProfileSource::Custom,
                    name: "Nu".to_string(),
                    executable: "nu".to_string(),
                    args: Vec::new(),
                    startup_dir: None,
                }],
            },
            ..AppSettings::default()
        };
        fs::write(
            &path,
            toml::to_string_pretty(&settings).expect("serialize settings"),
        )
        .expect("write settings");

        let loaded = load_settings_file(&path).expect("load settings");

        assert_eq!(
            loaded.profiles.default_profile_id,
            platform_default_profile_id().to_string()
        );
        assert!(platform_builtin_profiles().iter().all(|profile| loaded
            .profiles
            .items
            .iter()
            .any(|existing| existing.id == profile.id)));

        remove_temp_settings(&path);
    }

    #[tokio::test]
    async fn settings_store_update_repairs_invalid_profile_configuration() {
        let path = temp_settings_path("update");
        let store = SettingsStore::load(&path).expect("load store");

        let updated = store
            .update(aria_ipc::UpdateSettingsRequest {
                settings: UpdateAppSettingsPayload {
                    profiles: Some(ProfilesSettingsPatch {
                        default_profile_id: Some("missing".to_string()),
                        items: Some(vec![ShellProfile {
                            id: "custom:nu".to_string(),
                            source: ProfileSource::Custom,
                            name: "Nu".to_string(),
                            executable: "nu".to_string(),
                            args: Vec::new(),
                            startup_dir: None,
                        }]),
                    }),
                    ..UpdateAppSettingsPayload::default()
                },
            })
            .await
            .expect("update settings");

        assert_eq!(
            updated.profiles.default_profile_id,
            platform_default_profile_id().to_string()
        );
        assert!(platform_builtin_profiles().iter().all(|profile| updated
            .profiles
            .items
            .iter()
            .any(|existing| existing.id == profile.id)));

        remove_temp_settings(&path);
    }

    fn temp_settings_path(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        std::env::temp_dir().join(format!("aria-settings-{label}-{unique}.toml"))
    }

    fn remove_temp_settings(path: &PathBuf) {
        if path.exists() {
            fs::remove_file(path).expect("remove temp settings");
        }
    }
}
