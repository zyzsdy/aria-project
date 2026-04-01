use aria_model::{
    AppInfo, CursorPosition, HealthStatus, SessionId, SessionStatus, SessionTransportKind,
    TerminalSize,
};
use async_trait::async_trait;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::TcpStream,
    time::timeout,
};

pub const DEFAULT_DAEMON_ADDR: &str = "127.0.0.1:45783";
const DEFAULT_RPC_TIMEOUT_MS: u64 = 2_500;

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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLocalSessionRequest {
    pub size: TerminalSize,
    pub cwd: Option<String>,
    pub command: Option<Vec<String>>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateLocalSessionResponse {
    pub session_id: SessionId,
    pub summary: SessionSummary,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSessionsRequest;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListSessionsResponse {
    pub sessions: Vec<SessionSummary>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub session_id: SessionId,
    pub title: String,
    pub status: SessionStatus,
    pub transport: SessionTransportKind,
    pub size: TerminalSize,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMetadata {
    pub session_id: SessionId,
    pub title: String,
    pub status: SessionStatus,
    pub transport: SessionTransportKind,
    pub size: TerminalSize,
    pub created_at: String,
    pub updated_at: String,
    pub cwd: Option<String>,
    pub command: Vec<String>,
    pub shell: String,
    pub process_id: Option<u32>,
    pub exit_code: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrollbackStats {
    pub line_count: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub session_id: SessionId,
    pub size: TerminalSize,
    pub visible_lines: Vec<String>,
    pub cursor: CursorPosition,
    pub alternate_screen: bool,
    pub scrollback: ScrollbackStats,
    pub metadata: SessionMetadata,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSelector {
    pub session_id: SessionId,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionWriteRequest {
    pub session_id: SessionId,
    pub data: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionResizeRequest {
    pub session_id: SessionId,
    pub size: TerminalSize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmptyResponse {}

#[derive(Debug, Error)]
pub enum ContractError {
    #[error("service unavailable: {0}")]
    Unavailable(String),
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcRequest {
    pub method: String,
    pub payload: serde_json::Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RpcResponse {
    pub ok: bool,
    pub payload: Option<serde_json::Value>,
    pub error: Option<String>,
}

#[derive(Debug, Error)]
pub enum ClientError {
    #[error("failed to connect to daemon at {addr}: {source}")]
    Connect {
        addr: String,
        #[source]
        source: std::io::Error,
    },

    #[error("daemon RPC timed out after {0}ms")]
    Timeout(u64),

    #[error("I/O error while talking to daemon: {0}")]
    Io(#[source] std::io::Error),

    #[error("failed to serialize daemon request: {0}")]
    Serialize(#[source] serde_json::Error),

    #[error("failed to deserialize daemon response: {0}")]
    Deserialize(#[source] serde_json::Error),

    #[error("daemon returned an error: {0}")]
    Remote(String),

    #[error("daemon returned an invalid response")]
    InvalidResponse,
}

#[async_trait]
pub trait HealthService: Send + Sync {
    async fn ping(&self, request: HealthRequest) -> Result<HealthResponse, ContractError>;
}

#[async_trait]
pub trait SessionService: Send + Sync {
    async fn list_sessions(
        &self,
        request: ListSessionsRequest,
    ) -> Result<ListSessionsResponse, ContractError>;

    async fn create_local_session(
        &self,
        request: CreateLocalSessionRequest,
    ) -> Result<CreateLocalSessionResponse, ContractError>;

    async fn get_session_snapshot(
        &self,
        request: SessionSelector,
    ) -> Result<SessionSnapshot, ContractError>;

    async fn get_session_metadata(
        &self,
        request: SessionSelector,
    ) -> Result<SessionMetadata, ContractError>;

    async fn write_session(
        &self,
        request: SessionWriteRequest,
    ) -> Result<EmptyResponse, ContractError>;

    async fn resize_session(
        &self,
        request: SessionResizeRequest,
    ) -> Result<EmptyResponse, ContractError>;

    async fn close_session(&self, request: SessionSelector)
        -> Result<EmptyResponse, ContractError>;
}

#[derive(Clone, Debug)]
pub struct DaemonClient {
    addr: String,
    timeout: Duration,
}

impl Default for DaemonClient {
    fn default() -> Self {
        Self::new(DEFAULT_DAEMON_ADDR)
    }
}

impl DaemonClient {
    pub fn new(addr: impl Into<String>) -> Self {
        Self {
            addr: addr.into(),
            timeout: Duration::from_millis(DEFAULT_RPC_TIMEOUT_MS),
        }
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub fn addr(&self) -> &str {
        &self.addr
    }

    pub async fn health_ping(&self, request: HealthRequest) -> Result<HealthResponse, ClientError> {
        self.call("health.ping", &request).await
    }

    pub async fn list_sessions(
        &self,
        request: ListSessionsRequest,
    ) -> Result<ListSessionsResponse, ClientError> {
        self.call("sessions.list", &request).await
    }

    pub async fn create_local_session(
        &self,
        request: CreateLocalSessionRequest,
    ) -> Result<CreateLocalSessionResponse, ClientError> {
        self.call("sessions.createLocal", &request).await
    }

    pub async fn get_session_snapshot(
        &self,
        request: SessionSelector,
    ) -> Result<SessionSnapshot, ClientError> {
        self.call("sessions.getSnapshot", &request).await
    }

    pub async fn get_session_metadata(
        &self,
        request: SessionSelector,
    ) -> Result<SessionMetadata, ClientError> {
        self.call("sessions.getMetadata", &request).await
    }

    pub async fn write_session(
        &self,
        request: SessionWriteRequest,
    ) -> Result<EmptyResponse, ClientError> {
        self.call("sessions.write", &request).await
    }

    pub async fn resize_session(
        &self,
        request: SessionResizeRequest,
    ) -> Result<EmptyResponse, ClientError> {
        self.call("sessions.resize", &request).await
    }

    pub async fn close_session(
        &self,
        request: SessionSelector,
    ) -> Result<EmptyResponse, ClientError> {
        self.call("sessions.close", &request).await
    }

    pub async fn call<Req, Resp>(&self, method: &str, payload: &Req) -> Result<Resp, ClientError>
    where
        Req: Serialize + ?Sized,
        Resp: DeserializeOwned,
    {
        let request = RpcRequest {
            method: method.to_string(),
            payload: serde_json::to_value(payload).map_err(ClientError::Serialize)?,
        };

        let encoded = serde_json::to_vec(&request).map_err(ClientError::Serialize)?;
        let mut stream = timeout(self.timeout, TcpStream::connect(&self.addr))
            .await
            .map_err(|_| ClientError::Timeout(self.timeout.as_millis() as u64))?
            .map_err(|source| ClientError::Connect {
                addr: self.addr.clone(),
                source,
            })?;
        stream.write_all(&encoded).await.map_err(ClientError::Io)?;
        stream.write_all(b"\n").await.map_err(ClientError::Io)?;
        stream.flush().await.map_err(ClientError::Io)?;

        let mut line = String::new();
        let mut reader = BufReader::new(stream);
        timeout(self.timeout, reader.read_line(&mut line))
            .await
            .map_err(|_| ClientError::Timeout(self.timeout.as_millis() as u64))?
            .map_err(ClientError::Io)?;

        if line.trim().is_empty() {
            return Err(ClientError::InvalidResponse);
        }

        let response: RpcResponse =
            serde_json::from_str(&line).map_err(ClientError::Deserialize)?;

        if !response.ok {
            return Err(ClientError::Remote(
                response
                    .error
                    .unwrap_or_else(|| "unknown error".to_string()),
            ));
        }

        let payload = response.payload.ok_or(ClientError::InvalidResponse)?;
        serde_json::from_value(payload).map_err(ClientError::Deserialize)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        DaemonInfo, HealthRequest, HealthResponse, RpcRequest, RpcResponse, ScrollbackStats,
        SessionMetadata, SessionSnapshot, SessionSummary,
    };
    use aria_model::{
        AppInfo, CursorPosition, HealthStatus, SessionId, SessionStatus, SessionTransportKind,
        TerminalSize,
    };

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

    #[test]
    fn session_snapshot_round_trips() {
        let session_id = SessionId::new();
        let snapshot = SessionSnapshot {
            session_id,
            size: TerminalSize::new(80, 24),
            visible_lines: vec!["hello".to_string()],
            cursor: CursorPosition { row: 1, col: 5 },
            alternate_screen: false,
            scrollback: ScrollbackStats { line_count: 12 },
            metadata: SessionMetadata {
                session_id,
                title: "powershell".to_string(),
                status: SessionStatus::Running,
                transport: SessionTransportKind::LocalPty,
                size: TerminalSize::new(80, 24),
                created_at: "1".to_string(),
                updated_at: "2".to_string(),
                cwd: Some("C:/".to_string()),
                command: vec!["powershell.exe".to_string()],
                shell: "powershell.exe".to_string(),
                process_id: Some(42),
                exit_code: None,
            },
        };

        let json = serde_json::to_string(&snapshot).expect("serialize session snapshot");
        let decoded: SessionSnapshot =
            serde_json::from_str(&json).expect("deserialize session snapshot");

        assert_eq!(decoded.visible_lines[0], "hello");
        assert_eq!(decoded.metadata.transport, SessionTransportKind::LocalPty);
    }

    #[test]
    fn rpc_request_round_trips() {
        let request = RpcRequest {
            method: "sessions.list".to_string(),
            payload: serde_json::json!({}),
        };
        let response = RpcResponse {
            ok: true,
            payload: Some(
                serde_json::to_value(SessionSummary {
                    session_id: SessionId::new(),
                    title: "shell".to_string(),
                    status: SessionStatus::Running,
                    transport: SessionTransportKind::LocalPty,
                    size: TerminalSize::new(80, 24),
                    created_at: "1".to_string(),
                    updated_at: "1".to_string(),
                })
                .expect("serialize summary"),
            ),
            error: None,
        };

        let request_json = serde_json::to_string(&request).expect("serialize request");
        let response_json = serde_json::to_string(&response).expect("serialize response");

        assert!(request_json.contains("sessions.list"));
        assert!(response_json.contains("\"ok\":true"));
    }
}
