use anyhow::{Context, Result};
use aria_ipc::{
    AppSettings, AppearanceSettings, ResetSettingsGroupRequest, SettingsGroup,
    TerminalSettings, UpdateAppSettingsPayload, UpdateSettingsRequest, WorkspaceSettings,
};
use std::{
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

    toml::from_str(&contents).with_context(|| format!("parse settings file {}", path.display()))
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
        if let Some(copy_on_select) = terminal.copy_on_select {
            settings.terminal.copy_on_select = copy_on_select;
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
    }
}

#[cfg(test)]
mod tests {
    use super::{apply_settings_patch, reset_settings_group};
    use aria_ipc::{
        AppSettings, AppearanceSettingsPatch, SettingsGroup, TerminalSettingsPatch,
        UpdateAppSettingsPayload, WorkspaceSettingsPatch,
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
            },
        );

        assert_eq!(settings.appearance.font_size, 16);
        assert_eq!(settings.terminal.bell_mode, aria_ipc::BellMode::Visual);
        assert_eq!(
            settings.workspace.close_confirmation,
            aria_ipc::CloseConfirmation::Never
        );
        assert_eq!(settings.appearance.theme_preset, aria_ipc::ThemePreset::North);
    }

    #[test]
    fn reset_settings_group_restores_only_the_requested_group() {
        let mut settings = AppSettings::default();
        settings.appearance.font_size = 16;
        settings.terminal.scrollback_lines = 5_000;

        reset_settings_group(&mut settings, SettingsGroup::Appearance);

        assert_eq!(settings.appearance, aria_ipc::AppearanceSettings::default());
        assert_eq!(settings.terminal.scrollback_lines, 5_000);
    }
}
