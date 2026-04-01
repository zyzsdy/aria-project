mod app;
mod config;
mod error;
mod observability;
mod paths;

use aria_model::AppInfo;

pub use app::{AppEnvironment, AppRole};
pub use config::{load_config, AppConfig};
pub use error::{AriaError, Result};
pub use observability::{init_observability, ObservabilityHandle};
pub use paths::AppPaths;

#[derive(Clone, Debug)]
pub struct BootstrapContext {
    pub role: AppRole,
    pub app_info: AppInfo,
    pub env: AppEnvironment,
    pub paths: AppPaths,
    pub config: AppConfig,
}

impl BootstrapContext {
    pub fn load(role: AppRole, app_info: AppInfo) -> Result<Self> {
        let env = AppEnvironment::detect();
        let paths = AppPaths::discover(role)?;
        paths.ensure()?;
        let config = load_config(&paths)?;

        Ok(Self {
            role,
            app_info,
            env,
            paths,
            config,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{AppRole, BootstrapContext};
    use aria_model::AppInfo;

    #[test]
    fn bootstrap_loads_default_config() {
        let context = BootstrapContext::load(
            AppRole::Cli,
            AppInfo::new("Aria CLI", "0.1.0", None, std::env::consts::OS),
        )
        .expect("load bootstrap context");

        assert_eq!(context.config.log_level, "info");
    }
}
