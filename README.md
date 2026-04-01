# Aria Terminal

Aria Terminal is a cross-platform terminal platform with a Rust daemon, a Tauri desktop shell, and AI-friendly control surfaces. This repository currently contains the Phase 0 monorepo skeleton only: it is intended to compile cleanly and establish the shared boundaries for later PTY, SSH, layout, and plugin work.

## Repository layout

```text
apps/
  aria-cli/
  aria-daemon/
  aria-desktop/
crates/
  aria-core/
  aria-ipc/
  aria-model/
packages/
  aria-types/
docs/
  specs/
```

## Prerequisites

For Windows development, install these before running the bootstrap commands:

- `rustup` with the stable Rust toolchain
- Visual Studio C++ build tools
- Tauri Windows prerequisites
- `Node.js` 22 or newer
- `pnpm` via Corepack

The environment used to create this Phase 0 skeleton had `node` and `corepack`, but did not have `cargo`, `rustc`, or a standalone `pnpm` binary available on `PATH`. If your machine matches that state, install or enable the prerequisites first and then run the commands below.

## Getting started

```powershell
corepack enable
corepack pnpm install
cargo check --workspace
cargo test --workspace
corepack pnpm --filter @aria/desktop typecheck
corepack pnpm --filter @aria/desktop build
```

## Useful commands

```powershell
# Start the placeholder daemon
cargo run -p aria-daemon -- serve

# Print diagnostics about local paths and config loading
cargo run -p aria-cli -- doctor

# Run the desktop shell in Tauri dev mode
corepack pnpm --filter @aria/desktop tauri dev
```

## Phase 0 status

Implemented in this skeleton:

- Rust workspace with `aria-daemon`, `aria-cli`, and the desktop Rust shell
- Shared crates for bootstrap/config/logging, model types, and IPC contracts
- React + Vite desktop frontend scaffold
- Workspace package for frontend-safe shared types
- GitHub Actions CI skeleton for Windows

Deliberately not implemented yet:

- PTY or SSH transports
- Real daemon singleton lifecycle and IPC transport
- Plugin runtime
- Pretext integration
- Shell integration and AI orchestration APIs
