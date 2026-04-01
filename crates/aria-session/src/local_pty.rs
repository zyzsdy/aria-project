use crate::transport::{Transport, TransportMetadata};
use anyhow::{anyhow, Context, Result};
use aria_ipc::CreateLocalSessionRequest;
use aria_model::{SessionTransportKind, TerminalSize};
use async_trait::async_trait;
use portable_pty::{native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
use std::{
    ffi::OsString,
    io::{Read, Write},
};

pub struct LocalPtySpawn {
    pub transport: LocalPtyTransport,
    pub reader: Box<dyn Read + Send>,
    pub child: Box<dyn Child + Send>,
    pub command: Vec<String>,
    pub cwd: Option<String>,
    pub shell: String,
}

pub struct LocalPtyTransport {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    metadata: TransportMetadata,
}

pub fn default_command() -> Vec<String> {
    if cfg!(target_os = "windows") {
        let program = std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string());
        vec![program]
    } else {
        let program = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
        vec![program]
    }
}

impl LocalPtyTransport {
    pub fn spawn(request: &CreateLocalSessionRequest) -> Result<LocalPtySpawn> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(to_pty_size(request.size))
            .context("open local PTY")?;

        let command = match request.command.clone() {
            Some(command) if !command.is_empty() => command,
            _ => default_command(),
        };
        let shell = command
            .first()
            .cloned()
            .ok_or_else(|| anyhow!("missing shell command"))?;

        let mut builder = CommandBuilder::new(&command[0]);
        if command.len() > 1 {
            builder.args(&command[1..]);
        }
        if let Some(cwd) = request.cwd.as_ref() {
            builder.cwd(OsString::from(cwd));
        }

        let child = pair
            .slave
            .spawn_command(builder)
            .with_context(|| format!("spawn PTY command {:?}", command))?;
        let reader = pair.master.try_clone_reader().context("clone PTY reader")?;
        let writer = pair.master.take_writer().context("take PTY writer")?;

        let metadata = TransportMetadata {
            kind: SessionTransportKind::LocalPty,
            tty_name: None,
            process_id: child.process_id(),
        };

        Ok(LocalPtySpawn {
            transport: LocalPtyTransport {
                master: pair.master,
                writer,
                killer: child.clone_killer(),
                metadata,
            },
            reader,
            child,
            command,
            cwd: request.cwd.clone(),
            shell,
        })
    }
}

#[async_trait]
impl Transport for LocalPtyTransport {
    async fn write(&mut self, data: &[u8]) -> Result<()> {
        self.writer.write_all(data).context("write to PTY")?;
        self.writer.flush().context("flush PTY writer")?;
        Ok(())
    }

    async fn resize(&mut self, size: TerminalSize) -> Result<()> {
        self.master
            .resize(to_pty_size(size))
            .context("resize PTY")?;
        Ok(())
    }

    async fn shutdown(&mut self) -> Result<()> {
        self.killer.kill().context("terminate PTY child")?;
        Ok(())
    }

    fn metadata(&self) -> &TransportMetadata {
        &self.metadata
    }
}

fn to_pty_size(size: TerminalSize) -> PtySize {
    PtySize {
        rows: size.rows,
        cols: size.cols,
        pixel_width: size.pixel_width,
        pixel_height: size.pixel_height,
    }
}

#[cfg(test)]
mod tests {
    use super::default_command;

    #[test]
    fn default_command_returns_program() {
        let command = default_command();
        assert!(!command.is_empty());
    }
}
