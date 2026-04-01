use anyhow::Result;
use aria_model::{SessionTransportKind, TerminalSize};
use async_trait::async_trait;

#[derive(Clone, Debug)]
pub struct TransportMetadata {
    pub kind: SessionTransportKind,
    pub tty_name: Option<String>,
    pub process_id: Option<u32>,
}

#[async_trait]
pub trait Transport: Send {
    async fn write(&mut self, data: &[u8]) -> Result<()>;
    async fn resize(&mut self, size: TerminalSize) -> Result<()>;
    async fn shutdown(&mut self) -> Result<()>;
    fn metadata(&self) -> &TransportMetadata;
}
