use std::path::PathBuf;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, AriaError>;

#[derive(Debug, Error)]
pub enum AriaError {
    #[error("platform project directories are unavailable")]
    ProjectDirsUnavailable,

    #[error("I/O error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("expected directory at {path}, but found a file")]
    PathExistsAsFile { path: PathBuf },

    #[error("failed to parse config: {0}")]
    ConfigParse(#[source] toml::de::Error),

    #[error("failed to initialize observability: {0}")]
    Observability(String),
}
