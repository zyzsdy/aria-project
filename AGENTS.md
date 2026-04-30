# AGENTS.md

本文件用于指导 AI 代理处理本仓库代码。

- 始终使用**简体中文**思考和回复。
- 你是在 Windows 上运行，注意最大命令长度限制。不要输出多个文件组合在一起的大补丁，可以拆分成多次输出。
- 默认工作目录路径中包含空格！务必确认使用了正确的引号包裹命令参数。
- 不要通过直接修改 package.json 再同步的方式安装依赖，始终通过运行 pnpm add 命令的方式安装。这条规则也适用于其他语言的包管理器，例如 uv 和 cargo。通常应当安装最新稳定版，不要直接安装记忆中的版本号。
- 可以自由创建 git 分支，但除非用户显式提出，不要主动创建工作树。

## 项目概述

Aria Terminal 是一个面向 AI 的现代命令行终端模拟器。

Aria Terminal 是一个跨平台终端平台，采用三层架构：Rust 守护进程管理 PTY 会话、Tauri 桌面客户端、CLI 命令行客户端。通信使用基于 TCP 的 JSON-line RPC（`127.0.0.1:45783`）。

## 构建与测试命令

```powershell
# 安装依赖
corepack enable && corepack pnpm install

# Rust 工作区
cargo check --workspace          # 编译检查
cargo test --workspace           # 运行所有 Rust 测试
cargo test -p aria-ipc           # 运行单个 crate 的测试
cargo clippy --workspace         # 代码检查

# 桌面前端（TypeScript）
pnpm --filter @aria/desktop typecheck    # tsc --noEmit
pnpm --filter @aria/desktop build        # Vite 生产构建
pnpm --filter @aria/desktop test:unit    # Vitest 单元测试

# 运行
cargo run -p aria-daemon -- serve         # 启动守护进程
cargo run -p aria-cli -- doctor           # 诊断检查
pnpm --filter @aria/desktop tauri dev     # 桌面客户端（Tauri 开发模式）
```

根目录快捷命令：`pnpm build`、`pnpm typecheck`、`pnpm test:rust`、`pnpm check:rust`、`pnpm desktop:dev`、`pnpm desktop:build`。

## 架构

### 仓库结构

双语言仓库：Rust 工作区（`Cargo.toml`）与 pnpm 工作区（`pnpm-workspace.yaml`）并存。

- **apps/aria-daemon**（Rust）-- 后台守护进程。TCP 监听器、Actor 模型会话管理、设置持久化（TOML）、Shell 配置解析。锁文件单例模式。
- **apps/aria-cli**（Rust）-- CLI 客户端，包含子命令：`version`、`doctor`、`daemon status`、`sessions`、`tools terminal`。
- **apps/aria-desktop**（Tauri 2.0 + React 18 + Vite）-- 桌面 GUI。Rust 层（`src-tauri/`）通过 `DaemonClient` 桥接前端与守护进程。按需自动启动守护进程。
- **crates/aria-model** -- 领域类型（UUID 新类型、枚举）。无业务逻辑。
- **crates/aria-core** -- 启动引导、配置、日志（tracing + 滚动文件追加器）、平台路径。
- **crates/aria-ipc** -- IPC 契约：所有 RPC 请求/响应类型、`DaemonClient`、设置类型、会话流帧。最大的 crate。
- **crates/aria-terminal** -- `TerminalEngine` trait + `Vt100TerminalEngine`（vt100 crate）。
- **crates/aria-session** -- `SessionManager`（Actor 模型）、`LocalPtyTransport`（portable-pty）、`ScrollbackBuffer`（环形缓冲区）、`ReplayLog`。
- **packages/aria-types** -- TypeScript 接口，镜像 Rust IPC 类型。纯类型定义，无运行时代码。

### 数据流

```
[Shell] <--PTY--> [aria-daemon] <--TCP/JSON-line--> [aria-desktop src-tauri]
                                                        |
                                                     Tauri IPC (invoke + Channel)
                                                        |
                                                     [React + xterm.js]
```

### IPC 协议

- 守护进程监听 TCP `127.0.0.1:45783`（环境变量：`ARIA_DAEMON_ADDR`）。
- 请求/响应：JSON-line RPC（`RpcRequest` / `RpcResponse`）。
- 流式传输：`sessions.attachViewer` 升级为长连接，守护进程发送 `SessionStreamFrame` 变体（`terminal.rehydrate`、`terminal.bytes`、`session.metadata`、`viewer.detached`）。
- 桌面前端通过 `invoke()` 调用 Tauri 命令，内部使用 `DaemonClient`。流式传输使用 Tauri `Channel` API。

### 跨边界类型安全

`packages/aria-types` 镜像 `crates/aria-ipc` 的类型。两侧均使用 camelCase 命名（Rust 端使用 `#[serde(rename_all = "camelCase")]`，TypeScript 端匹配对应接口）。保持两者同步。

### 前端结构

- `App.tsx` -- 主组件，包含状态管理
- `components/workbench/main/` -- 终端工作区、标签页、xterm.js 画布
- `components/workbench/sidebar/` -- 会话列表、集合面板
- `settings/SettingsPage.tsx` -- 设置界面（功能完整）
- `terminal/` -- xterm.js 配置、WebGL/Unicode 插件配置
- `i18n/` -- 国际化，使用 `intl-messageformat`（支持英文、日文、简体中文）

## 代码风格

- **EditorConfig**：LF 换行符，2 空格缩进（`.rs` 文件为 4 空格），UTF-8 编码
- **Rust**：edition 2021，最低 rust-version 1.78。使用 `rust-toolchain.toml` 中配置的 Clippy + rustfmt。
- **TypeScript**：严格模式，ES2021 目标。测试使用 Vitest + jsdom。
- **序列化**：Rust 使用 `serde` 并配置 `camelCase` 重命名。TypeScript 类型必须与之匹配。
- **国际化**：用户可见的字符串必须通过 i18n 系统（`useT` hook）处理，禁止硬编码。
