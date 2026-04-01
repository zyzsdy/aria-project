use crate::{AppPaths, AriaError, Result};
use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    pub environment: Option<String>,
    pub log_level: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            environment: None,
            log_level: "info".to_string(),
        }
    }
}

pub fn load_config(paths: &AppPaths) -> Result<AppConfig> {
    if !paths.config_file.exists() {
        return Ok(AppConfig::default());
    }

    let contents = fs::read_to_string(&paths.config_file).map_err(|source| AriaError::Io {
        path: paths.config_file.clone(),
        source,
    })?;

    toml::from_str(&contents).map_err(AriaError::ConfigParse)
}
