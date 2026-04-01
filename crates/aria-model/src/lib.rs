use serde::{Deserialize, Serialize};
use std::{fmt, str::FromStr};
use uuid::Uuid;

macro_rules! define_id {
    ($name:ident) => {
        #[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(pub Uuid);

        impl $name {
            pub fn new() -> Self {
                Self(Uuid::new_v4())
            }

            pub fn as_uuid(self) -> Uuid {
                self.0
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                self.0.fmt(f)
            }
        }

        impl From<Uuid> for $name {
            fn from(value: Uuid) -> Self {
                Self(value)
            }
        }

        impl From<$name> for Uuid {
            fn from(value: $name) -> Self {
                value.0
            }
        }

        impl FromStr for $name {
            type Err = uuid::Error;

            fn from_str(value: &str) -> Result<Self, Self::Err> {
                Uuid::parse_str(value).map(Self)
            }
        }
    };
}

define_id!(SessionId);
define_id!(WindowId);
define_id!(ConnectionProfileId);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSize {
    pub cols: u16,
    pub rows: u16,
    pub pixel_width: u16,
    pub pixel_height: u16,
}

impl TerminalSize {
    pub const fn new(cols: u16, rows: u16) -> Self {
        Self {
            cols,
            rows,
            pixel_width: 0,
            pixel_height: 0,
        }
    }
}

impl Default for TerminalSize {
    fn default() -> Self {
        Self::new(80, 24)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorPosition {
    pub row: u16,
    pub col: u16,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionTransportKind {
    LocalPty,
    Ssh,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Starting,
    Running,
    Exited,
    Closed,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub build_time: Option<String>,
    pub platform: String,
}

impl AppInfo {
    pub fn new(
        name: impl Into<String>,
        version: impl Into<String>,
        build_time: Option<String>,
        platform: impl Into<String>,
    ) -> Self {
        Self {
            name: name.into(),
            version: version.into(),
            build_time,
            platform: platform.into(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    Unknown,
    Starting,
    Ready,
    Degraded,
}

#[cfg(test)]
mod tests {
    use super::{HealthStatus, SessionId, SessionStatus, TerminalSize};

    #[test]
    fn ids_are_unique() {
        assert_ne!(SessionId::new(), SessionId::new());
    }

    #[test]
    fn health_status_serializes_as_snake_case() {
        let json = serde_json::to_string(&HealthStatus::Ready).expect("serialize health status");
        assert_eq!(json, "\"ready\"");
    }

    #[test]
    fn terminal_size_has_expected_default() {
        assert_eq!(TerminalSize::default().cols, 80);
        assert_eq!(TerminalSize::default().rows, 24);
    }

    #[test]
    fn session_status_serializes_as_snake_case() {
        let json =
            serde_json::to_string(&SessionStatus::Running).expect("serialize session status");
        assert_eq!(json, "\"running\"");
    }
}
