# Aria Terminal 技术选型方案 v0.1

- 状态：Draft
- 日期：2026-04-03
- 所属阶段：Phase 2 基线回顾
- 关联文档：
  - `docs/specs/terminal-platform-spec.md`
  - `docs/specs/terminal-session-stream-protocol-spec.md`
  - `docs/specs/desktop-workbench-visual-style-spec.md`

## 1. 文档目的

本文档不是重新发明一套理想架构，而是基于当前仓库已经落地的 Phase 0 ~ Phase 2 代码，沉淀一份“继续开发时默认沿用的技术选型基线”。

它回答三个问题：

1. 当前项目实际上选了什么。
2. 这些选择解决了什么问题，为什么适合当前阶段。
3. 进入 Phase 3 及后续阶段时，哪些边界应该继续保持，哪些点暂时不要过早定型。

## 2. 当前结论摘要

截至 2026-04-03，Aria Terminal 的 Phase 2 基础能力已经形成一条明确的实现主链：

- 后端语言与核心运行时：Rust + Tokio。
- 桌面宿主：Tauri v2。
- 前端 UI：React 18 + TypeScript + Vite。
- 终端渲染：`xterm` + `@xterm/addon-canvas` + `@xterm/addon-fit`。
- 本地终端接入：`portable-pty`。
- 终端状态解析与 rehydrate：`vt100`，并通过 `TerminalEngine` trait 做隔离。
- 会话模型：`SessionManager` + 每会话 actor/task。
- 传输协议：控制面 RPC + 附着后的长连接事件流，事件采用序号、ack、replay 与 rehydrate 混合机制。
- 共享契约：Rust 侧 `aria-model`、`aria-ipc`，前端侧 `@aria/types`。
- 可观测性与启动骨架：`tracing`、`tracing-subscriber`、`directories`、统一 bootstrap。

这套组合的核心特点是：后端持有终端权威状态，前端负责交互与渲染；steady-state 走原始终端字节流，attach / resync 走 rehydrate。

## 3. 选型原则

从当前代码看，项目实际上已经遵循了以下原则，后续应继续保持：

### 3.1 后端是权威状态源

- `aria-session` 中的 `SessionActor` 同时持有 transport、terminal engine、scrollback、viewer 列表和 replay log。
- 前端不是状态真源，断开后可以通过 attach + rehydrate 恢复。

这保证多 viewer、重连恢复、后续 AI 读取和自动化接入都建立在同一个 session 语义上。

### 3.2 协议与承载分离

- 当前 daemon 与 desktop 之间实际使用的是 loopback TCP + JSON line。
- 但上层模型已经被抽象为 RPC 请求响应和 `SessionStreamFrame` 事件流。

这意味着将来即使把载体替换成 Named Pipe / Unix Domain Socket / WebSocket，也不需要重写业务语义。

### 3.3 先复用成熟终端生态，再保留替换点

- 后端没有自研 VT parser，而是使用 `vt100`。
- 前端没有自研渲染器，而是使用 `xterm` 及 canvas addon。
- 同时，后端仍然保留了 `TerminalEngine` trait，避免被某个具体 crate 锁死。

这适合当前阶段：优先把会话模型、协议边界和恢复机制做稳，而不是过早投入自研渲染栈。

### 3.4 Windows 优先，但不写死平台路径

- 默认本地 shell 在 Windows 下来自 `COMSPEC`，其他平台走 `SHELL`。
- PTY 通过 `portable-pty` 抽象统一。
- 应用目录通过 `directories::ProjectDirs` 统一发现。

这与最初平台 spec 中“Windows 主目标、兼顾跨平台”的方向一致。

## 4. 分层技术选型

### 4.1 仓库与构建体系

已确认选型：

- Rust monorepo：Cargo workspace。
- 前端 monorepo：pnpm workspace。
- 桌面应用采用“前端包 + `src-tauri` Rust 宿主”的标准 Tauri 结构。

当前收益：

- Rust 核心能力可以按 crate 拆分，便于保持 daemon、session、terminal、contract 的边界清晰。
- 前端类型包 `@aria/types` 可以被桌面 UI 直接消费，避免在 React 层散落魔法字符串。
- Rust 与前端各自沿用成熟工具链，不强行混成单一构建系统。

建议保持：

- 继续按“平台能力 crate / 宿主应用 app / 前端 package”拆分。
- Phase 3 以后新增 layout、ssh、plugin 等模块时，优先新增独立 crate，不把责任堆回 `aria-session`。

### 4.2 核心域模型与共享契约

已确认选型：

- `aria-model` 负责稳定的基础实体与枚举，如 `SessionId`、`ViewerId`、`TerminalSize`、`SessionStatus`。
- `aria-ipc` 负责跨进程 contract、RPC 请求响应和流式 frame。
- `@aria/types` 在前端侧镜像这些协议类型。

当前收益：

- 协议边界清晰，daemon、CLI、desktop shell 和 React UI 都围绕同一套对象模型工作。
- `SessionStreamFrame` 已经具备 `terminal.rehydrate`、`terminal.bytes`、`session.metadata`、`viewer.detached` 四类核心事件。
- base64 编码约束已经固定，前端无需猜测 payload 语义。

建议保持：

- 后续新增协议时，先改 `aria-ipc` 再同步 `@aria/types`，避免 UI 私自扩张协议。
- 继续保持 `session_id` / `viewer_id` / `seq` 这些协议级身份，不要退回隐式绑定。

### 4.3 后端运行时与守护进程

已确认选型：

- `tokio` 作为统一异步运行时。
- `anyhow` 处理应用层错误传播，`thiserror` 用于 contract / domain 错误。
- `tracing` + `tracing-subscriber` 处理日志与诊断。
- daemon 采用单实例思路，并通过 lock file + health check 去重。

当前收益：

- 当前 daemon 生命周期已经满足“桌面启动时拉起 / 已在运行则复用”的 Phase 2 需求。
- 后端异步模型适合后续接入更多 session、viewer 和长连接。
- 诊断链路已经统一，后续排查 attach、replay、shell 行为会比散落的 `println!` 更可控。

暂不定型但保留方向：

- 当前 RPC 承载是 loopback TCP，不是最终形态。
- 到需要更严格本地安全边界时，再替换为平台原生 IPC；在此之前，不建议为了“理论更正确”过早重写连接层。

### 4.4 Session 与本地 PTY 接入

已确认选型：

- `SessionManager` 作为 session 注册表与调度入口。
- 每个 session 由一个 actor/task 驱动。
- 本地终端 transport 使用 `portable-pty`。

当前收益：

- 会话创建、写入、resize、快照、scrollback、关闭都通过统一命令入口流转。
- actor 模型把 session 内状态串行化，降低了并发状态错乱的风险。
- `portable-pty` 让 Windows 平台接入不需要先自行封装 ConPTY 细节。

建议保持：

- Phase 4 接入 SSH 时，沿用 `Transport` trait 扩展，不要让 SSH 直接绕过 session actor。
- session 元信息继续由后端维护，不要让前端缓存成为事实来源。

### 4.5 终端状态引擎

已确认选型：

- `aria-terminal` 当前唯一实现是 `Vt100TerminalEngine`。
- 对外暴露 trait：`process`、`resize`、`snapshot`、`rehydrate`。
- rehydrate 输出的是 VT payload，而不是前端专用结构化 buffer。

当前收益：

- 后端有权威屏幕状态，可同时服务 snapshot、rehydrate 和未来 AI 派生接口。
- 前端 attach 时可以直接把 payload 喂给 `xterm`，无需引入第二套渲染语义。
- `vt100` 负责终端控制序列兼容性，当前阶段成本最低。

建议保持：

- 不要让前端依赖 parser 的内部状态结构。
- 如果未来替换 `vt100`，也应继续保留 `TerminalEngine` 抽象和 VT rehydrate 契约。

### 4.6 Stream 协议与恢复策略

已确认选型：

- 控制面保留普通 RPC。
- 实时面通过 `sessions.attachViewer` 建立持续流。
- 流式同步采用 `seq + ack + replay + rehydrate` 混合策略。
- steady-state 主路径发送 `terminal.bytes`，而不是行级 diff。

这是当前代码里最关键的技术决策，建议视为 Phase 2 的正式基线。

原因：

- 对普通 shell 和全屏 TUI 都更友好，避免后端把压缩良好的 VT 字节流再次展开为高频结构化 patch。
- 新 viewer 或断线恢复仍然可以依赖 `terminal.rehydrate` 回到当前权威状态。
- 事件序号和 ack 让重连语义明确，为 Phase 3 多 viewer 和未来 AI observer 打好基础。

建议保持：

- 不回退到 snapshot 轮询驱动渲染。
- 不在 hot path 上引入前端专用 diff 协议。
- replay log 只做短窗口恢复，不把它误当成长期录制能力。

### 4.7 Scrollback 策略

已确认选型：

- `ScrollbackBuffer` 使用内存 ring buffer。
- 维护稳定递增的 `line_id`。
- 通过 `readScrollback(beforeLineId, limit)` 做向后分页。

当前收益：

- 实现简单，足够支撑 Phase 2 的历史读取与 attach 需求。
- `line_id` 稳定后，后续搜索、AI 摘录、历史面板都可以在此基础上演进。

暂缓决策：

- 当前没有磁盘持久化录制，也没有全文索引。
- 在真正出现录制、检索、审计需求前，不建议把 scrollback 主路径搬进数据库。

### 4.8 桌面宿主与前端技术栈

已确认选型：

- Tauri v2 作为桌面壳。
- React 18 + TypeScript + Vite 作为 UI 组合。
- 宿主 Rust 侧负责 daemon 启动、命令桥接和流转发。
- 前端使用 `invoke` 与 `Channel` 组合接入控制面和实时面。

当前收益：

- Tauri 让桌面壳和 Web UI 的职责边界清楚。
- React 当前用局部 state 就能支撑单窗口 Phase 2，不需要过早引入全局状态库。
- Rust 宿主代管 daemon 生命周期，比让前端直接处理进程拉起更稳。

建议保持：

- 在出现多窗口共享复杂状态前，不必急着接 Redux / Zustand 一类状态库。
- 桌面宿主继续充当“协议桥 + 生命周期管理器”，不要把业务逻辑重新塞回前端。

### 4.9 终端渲染与视觉层

已确认选型：

- `xterm` 作为终端组件。
- `@xterm/addon-canvas` 作为当前渲染后端。
- `@xterm/addon-fit` 处理视口适配。
- 字体、字号、主题在 React 层即时切换。

当前收益：

- 比自研 renderer 更快得到可交互结果。
- canvas 渲染与 Phase 2 spec 中的性能目标一致。
- 当前主题系统已经与桌面视觉 spec 对齐，支持即时切换且不影响协议层设计。

不建议现在做的事：

- 不要在 Phase 2 刚完成时切回自研 terminal renderer。
- 不要为了“更先进”过早切 WebGL / WebGPU。

### 4.10 配置、路径与日志

已确认选型：

- 启动上下文统一通过 `BootstrapContext` 组装。
- `directories` 负责按角色发现 config/data/cache/log 路径。
- `tracing-appender` 负责滚动日志文件。

当前收益：

- CLI、daemon、desktop 三个可执行单元已经有一致的启动骨架。
- 后续新增 role 或新增配置项时，不需要再重复搭基础设施。

建议保持：

- 所有新增应用级配置都继续走 `aria-core`。
- 不要在 app 层直接硬编码目录与日志初始化逻辑。

## 5. 当前暂缓或尚未落地的选型

以下内容已在总 spec 中预留，但当前代码尚未真正定型，不应假装已经决定：

- SSH 实现与认证栈。
- Layout Manager、Window/Tab/Pane 的持久化模型。
- 插件运行时与 JS engine 选择。
- 元数据库与持久化 schema。
- localhost 外部网关与鉴权模型。
- AI shell integration 与结构化块语义。

结论是：这些主题可以继续沿用总 spec 的方向，但当前阶段不要让它们反向污染已经稳定的 session / viewer / stream 主链。

## 6. 后续阶段的约束建议

进入 Phase 3 及后续阶段时，建议把以下约束视为“默认不破坏”：

1. `Session` 仍然是核心抽象，新的布局能力只能围绕 session / viewer 关系扩展。
2. 前端渲染继续消费协议事件，不直接操纵 daemon 内部状态。
3. 新 transport 必须实现统一 `Transport` 边界。
4. 新的 AI / 搜索 / 历史能力尽量建立在后端权威状态和 scrollback 之上，而不是旁路抓屏。
5. IPC 载体可以替换，但 `aria-ipc` 中的逻辑协议对象应尽量保持稳定。

## 7. 最终建议

如果要用一句话概括当前阶段的技术选型结论，那就是：

Aria Terminal 现阶段最值得继续坚持的，不是某个具体 crate，而是“Rust 后端持有权威终端状态，前端用成熟终端库消费 attach/rehydrate/byte-stream 协议”这一条主架构路线。

围绕这条路线，当前仓库已经做出的具体选择是合理且彼此一致的，足以支撑继续进入 Phase 3，而不需要在 Phase 2 结束后重新推翻基础设施。
