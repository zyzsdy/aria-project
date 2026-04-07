use aria_ipc::{AppSettings, CreateLocalSessionRequest, ShellProfile};

#[derive(Debug, Clone)]
pub struct ResolvedLocalSessionRequest {
    pub request: CreateLocalSessionRequest,
    pub title_override: Option<String>,
}

pub fn resolve_local_session_request(
    request: CreateLocalSessionRequest,
    settings: &AppSettings,
) -> ResolvedLocalSessionRequest {
    let home_dir = resolve_user_home_dir();
    resolve_local_session_request_with_home_dir(request, settings, home_dir.as_deref())
}

fn resolve_local_session_request_with_home_dir(
    mut request: CreateLocalSessionRequest,
    settings: &AppSettings,
    home_dir: Option<&str>,
) -> ResolvedLocalSessionRequest {
    let needs_profile_command = request.command.is_none();
    let needs_profile_cwd = request.cwd.is_none();
    let profile = if needs_profile_command || needs_profile_cwd {
        select_profile(request.profile_id.as_deref(), settings)
    } else {
        None
    };

    if needs_profile_command {
        request.command = profile.map(command_from_profile);
    }

    if needs_profile_cwd {
        request.cwd = profile.and_then(|profile| resolve_profile_startup_dir(profile, home_dir));
    }

    ResolvedLocalSessionRequest {
        title_override: if needs_profile_command {
            profile.map(|profile| profile.name.clone())
        } else {
            None
        },
        request,
    }
}

fn select_profile<'a>(
    requested_profile_id: Option<&str>,
    settings: &'a AppSettings,
) -> Option<&'a ShellProfile> {
    let selected_id = requested_profile_id.unwrap_or(&settings.profiles.default_profile_id);

    settings
        .profiles
        .items
        .iter()
        .find(|profile| profile.id == selected_id)
        .or_else(|| {
            settings
                .profiles
                .items
                .iter()
                .find(|profile| profile.id == settings.profiles.default_profile_id)
        })
}

fn command_from_profile(profile: &ShellProfile) -> Vec<String> {
    let mut command = vec![profile.executable.clone()];
    command.extend(profile.args.clone());
    command
}

fn resolve_profile_startup_dir(profile: &ShellProfile, home_dir: Option<&str>) -> Option<String> {
    match profile.startup_dir.as_deref() {
        Some(path) if !path.trim().is_empty() => Some(path.to_string()),
        _ => home_dir.map(ToOwned::to_owned),
    }
}

fn resolve_user_home_dir() -> Option<String> {
    std::env::var("HOME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            std::env::var("USERPROFILE")
                .ok()
                .filter(|value| !value.trim().is_empty())
        })
        .or_else(|| match (std::env::var("HOMEDRIVE"), std::env::var("HOMEPATH")) {
            (Ok(drive), Ok(path)) if !drive.trim().is_empty() && !path.trim().is_empty() => {
                Some(format!("{drive}{path}"))
            }
            _ => None,
        })
}

#[cfg(test)]
mod tests {
    use super::resolve_local_session_request_with_home_dir;
    use aria_ipc::{
        AppSettings, CreateLocalSessionRequest, ProfileSource, ProfilesSettings, ShellProfile,
    };
    use aria_model::TerminalSize;

    #[test]
    fn uses_default_profile_when_command_and_cwd_are_not_provided() {
        let settings = test_settings();

        let resolved = resolve_local_session_request_with_home_dir(
            CreateLocalSessionRequest {
                size: TerminalSize::new(120, 32),
                cwd: None,
                command: None,
                profile_id: None,
            },
            &settings,
            Some("C:/Users/tester"),
        );

        assert_eq!(
            resolved.request.command,
            Some(vec!["powershell.exe".to_string(), "-NoLogo".to_string()])
        );
        assert_eq!(resolved.request.cwd, Some("C:/Users/tester".to_string()));
        assert_eq!(resolved.title_override.as_deref(), Some("PowerShell"));
    }

    #[test]
    fn uses_explicit_profile_id_when_present() {
        let settings = test_settings();

        let resolved = resolve_local_session_request_with_home_dir(
            CreateLocalSessionRequest {
                size: TerminalSize::new(120, 32),
                cwd: None,
                command: None,
                profile_id: Some("custom:fish".to_string()),
            },
            &settings,
            Some("C:/Users/tester"),
        );

        assert_eq!(
            resolved.request.command,
            Some(vec!["fish".to_string(), "--login".to_string()])
        );
        assert_eq!(resolved.request.cwd, Some("D:/shells".to_string()));
        assert_eq!(resolved.title_override.as_deref(), Some("Fish"));
    }

    #[test]
    fn preserves_explicit_command_and_cwd_over_profile_defaults() {
        let settings = test_settings();

        let resolved = resolve_local_session_request_with_home_dir(
            CreateLocalSessionRequest {
                size: TerminalSize::new(120, 32),
                cwd: Some("E:/workspace".to_string()),
                command: Some(vec!["pwsh-preview.exe".to_string()]),
                profile_id: Some("custom:fish".to_string()),
            },
            &settings,
            Some("C:/Users/tester"),
        );

        assert_eq!(
            resolved.request.command,
            Some(vec!["pwsh-preview.exe".to_string()])
        );
        assert_eq!(resolved.request.cwd, Some("E:/workspace".to_string()));
        assert_eq!(resolved.title_override, None);
    }

    #[test]
    fn uses_home_dir_when_profile_startup_dir_is_empty() {
        let settings = AppSettings {
            profiles: ProfilesSettings {
                default_profile_id: "builtin:powershell".to_string(),
                items: vec![ShellProfile {
                    id: "builtin:powershell".to_string(),
                    source: ProfileSource::Builtin,
                    name: "PowerShell".to_string(),
                    executable: "powershell.exe".to_string(),
                    args: Vec::new(),
                    startup_dir: Some(String::new()),
                }],
            },
            ..AppSettings::default()
        };

        let resolved = resolve_local_session_request_with_home_dir(
            CreateLocalSessionRequest {
                size: TerminalSize::new(120, 32),
                cwd: None,
                command: None,
                profile_id: None,
            },
            &settings,
            Some("C:/Users/tester"),
        );

        assert_eq!(resolved.request.cwd, Some("C:/Users/tester".to_string()));
    }

    fn test_settings() -> AppSettings {
        AppSettings {
            profiles: ProfilesSettings {
                default_profile_id: "builtin:powershell".to_string(),
                items: vec![
                    ShellProfile {
                        id: "builtin:powershell".to_string(),
                        source: ProfileSource::Builtin,
                        name: "PowerShell".to_string(),
                        executable: "powershell.exe".to_string(),
                        args: vec!["-NoLogo".to_string()],
                        startup_dir: None,
                    },
                    ShellProfile {
                        id: "custom:fish".to_string(),
                        source: ProfileSource::Custom,
                        name: "Fish".to_string(),
                        executable: "fish".to_string(),
                        args: vec!["--login".to_string()],
                        startup_dir: Some("D:/shells".to_string()),
                    },
                ],
            },
            ..AppSettings::default()
        }
    }
}
