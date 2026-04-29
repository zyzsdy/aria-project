# CLAUDE.md

这个文件用于Cluade Code处理本仓库代码时的指示。

- 始终使用**简体中文**思考和回复。
- 你是在Windows上运行，小心最大命令长度限制。不要输出多个文件组合在一起的大patch，你可以拆成多次输出。
- 你的默认工作目录中有空格！ - 始终确认使用正确的引号包裹了命令参数。
- 不要通过直接修改package.json再同步的模式安装依赖，始终通过运行pnpm add命令的方式，这条也适用于其他语言的包管理器，例如uv和cargo。你通常应当安装最新稳定版，不要直接安装你记忆里的版本号。
- 你可以自由的建立git分支，但是，除非用户显式提出，不要主动建立工作树。

## Project Overview

Aria Terminal 是一个面向AI的命令行开发与命令行使用的现代终端模拟器。

Aria Terminal is a cross-platform terminal platform with a three-tier architecture: a Rust daemon managing PTY sessions, a Tauri desktop shell, and a CLI client. Communication uses JSON-line RPC over TCP (`127.0.0.1:45783`).

## Build & Test Commands

```powershell
# Install dependencies
corepack enable && corepack pnpm install

# Rust workspace
cargo check --workspace          # compile check
cargo test --workspace           # run all Rust tests
cargo test -p aria-ipc           # run tests for a single crate
cargo clippy --workspace         # lint

# Desktop frontend (TypeScript)
pnpm --filter @aria/desktop typecheck    # tsc --noEmit
pnpm --filter @aria/desktop build        # Vite production build
pnpm --filter @aria/desktop test:unit    # Vitest unit tests

# Run
cargo run -p aria-daemon -- serve         # start daemon
cargo run -p aria-cli -- doctor           # diagnostics
pnpm --filter @aria/desktop tauri dev     # desktop shell (Tauri dev mode)
```

Root-level shortcuts: `pnpm build`, `pnpm typecheck`, `pnpm test:rust`, `pnpm check:rust`, `pnpm desktop:dev`, `pnpm desktop:build`.

## Architecture

### Monorepo Layout

Dual-language monorepo: Rust workspace (`Cargo.toml`) + pnpm workspace (`pnpm-workspace.yaml`) coexist.

- **apps/aria-daemon** (Rust) -- Background daemon. TCP listener, actor-model session management, settings persistence (TOML), shell profile resolution. Lock-file singleton.
- **apps/aria-cli** (Rust) -- CLI client with subcommands: `version`, `doctor`, `daemon status`, `sessions`, `tools terminal`.
- **apps/aria-desktop** (Tauri 2.0 + React 18 + Vite) -- Desktop GUI. Rust layer (`src-tauri/`) bridges frontend to daemon via `DaemonClient`. Auto-launches daemon if needed.
- **crates/aria-model** -- Domain types (UUID newtypes, enums). No business logic.
- **crates/aria-core** -- Bootstrap, config, logging (tracing + rolling file appender), platform paths.
- **crates/aria-ipc** -- IPC contract: all RPC request/response types, `DaemonClient`, settings types, session stream frames. Largest crate.
- **crates/aria-terminal** -- `TerminalEngine` trait + `Vt100TerminalEngine` (vt100 crate).
- **crates/aria-session** -- `SessionManager` (actor model), `LocalPtyTransport` (portable-pty), `ScrollbackBuffer` (ring buffer), `ReplayLog`.
- **packages/aria-types** -- TypeScript interfaces mirroring Rust IPC types. Pure types, no runtime code.

### Data Flow

```
[Shell] <--PTY--> [aria-daemon] <--TCP/JSON-line--> [aria-desktop src-tauri]
                                                        |
                                                     Tauri IPC (invoke + Channel)
                                                        |
                                                     [React + xterm.js]
```

### IPC Protocol

- Daemon listens on TCP `127.0.0.1:45783` (env: `ARIA_DAEMON_ADDR`).
- Request/response: JSON-line RPC (`RpcRequest` / `RpcResponse`).
- Streaming: `sessions.attachViewer` upgrades to long-lived connection, daemon sends `SessionStreamFrame` variants (`terminal.rehydrate`, `terminal.bytes`, `session.metadata`, `viewer.detached`).
- Desktop frontend calls Tauri commands via `invoke()`, which internally use `DaemonClient`. Streaming uses Tauri `Channel` API.

### Type Safety Across Boundary

`packages/aria-types` mirrors `crates/aria-ipc` types. Both sides use camelCase (`#[serde(rename_all = "camelCase")]` on Rust, matching TS interfaces). Keep them in sync.

### Frontend Structure

- `App.tsx` -- Main component with state management
- `components/workbench/main/` -- Terminal workspace, tabs, xterm.js surface
- `components/workbench/sidebar/` -- Session list, collections panel
- `settings/SettingsPage.tsx` -- Settings UI (comprehensive)
- `terminal/` -- xterm.js options, WebGL/Unicode addon config
- `i18n/` -- Internationalization with `intl-messageformat` (en, ja, zh-CN)

## Code Style

- **EditorConfig**: LF line endings, 2-space indent (4-space for `.rs`), UTF-8
- **Rust**: edition 2021, minimum rust-version 1.78. Clippy + rustfmt from `rust-toolchain.toml`.
- **TypeScript**: strict mode, ES2021 target. Tests use Vitest + jsdom.
- **Serialization**: Rust uses `serde` with `camelCase` rename. TypeScript types must match.
- **i18n**: User-facing strings go through the i18n system (`useT` hook), not hardcoded.
