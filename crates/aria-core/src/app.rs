use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppRole {
    Daemon,
    Desktop,
    Cli,
}

impl AppRole {
    pub fn slug(self) -> &'static str {
        match self {
            Self::Daemon => "daemon",
            Self::Desktop => "desktop",
            Self::Cli => "cli",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Daemon => "Aria Daemon",
            Self::Desktop => "Aria Desktop",
            Self::Cli => "Aria CLI",
        }
    }
}

impl fmt::Display for AppRole {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.slug())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppEnvironment {
    Development,
    Production,
}

impl AppEnvironment {
    pub fn detect() -> Self {
        if cfg!(debug_assertions) {
            Self::Development
        } else {
            Self::Production
        }
    }
}
