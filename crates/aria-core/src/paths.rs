use crate::{AppRole, AriaError, Result};
use directories::ProjectDirs;
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug)]
pub struct AppPaths {
    pub config_dir: PathBuf,
    pub data_dir: PathBuf,
    pub cache_dir: PathBuf,
    pub log_dir: PathBuf,
    pub config_file: PathBuf,
}

impl AppPaths {
    pub fn discover(role: AppRole) -> Result<Self> {
        let project_dirs = ProjectDirs::from("io", "Aria", "AriaTerminal")
            .ok_or(AriaError::ProjectDirsUnavailable)?;

        let config_dir = project_dirs.config_dir().join(role.slug());
        let data_dir = project_dirs.data_dir().join(role.slug());
        let cache_dir = project_dirs.cache_dir().join(role.slug());
        let log_dir = project_dirs.data_local_dir().join("logs").join(role.slug());
        let config_file = config_dir.join("app.toml");

        Ok(Self {
            config_dir,
            data_dir,
            cache_dir,
            log_dir,
            config_file,
        })
    }

    pub fn ensure(&self) -> Result<()> {
        for path in [
            self.config_dir.as_path(),
            self.data_dir.as_path(),
            self.cache_dir.as_path(),
            self.log_dir.as_path(),
        ] {
            create_dir(path)?;
        }

        Ok(())
    }
}

fn create_dir(path: &Path) -> Result<()> {
    if path.is_dir() {
        return Ok(());
    }

    if path.exists() {
        return Err(AriaError::PathExistsAsFile {
            path: path.to_path_buf(),
        });
    }

    fs::create_dir_all(path).map_err(|source| AriaError::Io {
        path: path.to_path_buf(),
        source,
    })
}
