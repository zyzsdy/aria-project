use aria_model::{AppInfo, HealthStatus};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthRequest {
    pub verbose: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonInfo {
    pub pid: u32,
    pub api_version: String,
    pub started_at: Option<String>,
    pub role: String,
    pub status: HealthStatus,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub status: HealthStatus,
    pub app: AppInfo,
    pub daemon: Option<DaemonInfo>,
    pub message: String,
}

#[derive(Debug, Error)]
pub enum ContractError {
    #[error("service unavailable: {0}")]
    Unavailable(String),
}

#[async_trait]
pub trait HealthService: Send + Sync {
    async fn ping(&self, request: HealthRequest) -> Result<HealthResponse, ContractError>;
}

#[cfg(test)]
mod tests {
    use super::{DaemonInfo, HealthRequest, HealthResponse};
    use aria_model::{AppInfo, HealthStatus};

    #[test]
    fn health_response_round_trips() {
        let response = HealthResponse {
            status: HealthStatus::Ready,
            app: AppInfo::new("Aria", "0.1.0", None, "windows"),
            daemon: Some(DaemonInfo {
                pid: 1000,
                api_version: "phase0".to_string(),
                started_at: None,
                role: "daemon".to_string(),
                status: HealthStatus::Ready,
            }),
            message: "ok".to_string(),
        };

        let json = serde_json::to_string(&response).expect("serialize health response");
        let decoded: HealthResponse =
            serde_json::from_str(&json).expect("deserialize health response");

        assert_eq!(decoded.message, "ok");
        assert!(decoded.daemon.is_some());
        assert!(!HealthRequest::default().verbose);
    }
}
