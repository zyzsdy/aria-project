# Aria Desktop Workbench Visual Style Spec v0.1

- 状态：Draft
- 日期：2026-04-03
- 所属阶段：Phase 2
- 关联文档：`docs/specs/terminal-platform-spec.md`
- 关联文档：`docs/specs/terminal-session-stream-protocol-spec.md`
- 目标读者：`aria-desktop`、终端渲染器、交互设计与后续 UI 实现者

## 1. 背景

当前 `aria-desktop` 的 Phase 1 UI 本质上仍是一个调试壳：

1. 首页结构偏 landing page / dashboard。
2. 视觉中心是 hero 卡片，而不是终端工作台。
3. 面板关系、标签结构、会话导航都还没有形成稳定的 desktop workbench 语言。

这与 Phase 2 的目标不匹配。进入 renderer 阶段后，桌面端默认界面必须从“展示当前能力”切换为“承载长期使用的终端工作台”。

本次设计方向已经明确：

1. 整体风格：采用“VS Code 的工作台结构 + Windows Terminal 的沉浸质感”。
2. 默认布局：采用终端优先的 A 方案。
3. 顶部标签栏：采用更贴近 VS Code 的 A 方案，即嵌入式 workbench tab，而不是浮动胶囊 tab。

## 2. 设计目标与非目标

### 2.1 设计目标

1. 默认首屏必须让用户立刻理解“这是一个终端工作台”，而不是营销页。
2. 终端区域必须是视觉和交互中心，默认占据绝大多数可用面积。
3. 界面结构要足够克制，能自然承载 session、layout、AI、连接管理与未来插件面板。
4. 风格上要现代、冷静、专业，带少量 Windows Terminal 式沉浸感，但不能走霓虹或玩具感。
5. 组件层级、尺寸、间距、颜色都要可系统化，便于后续主题化。

### 2.2 非目标

1. 本 spec 不定义前端状态管理或具体 React 组件实现。
2. 本 spec 不要求在 Phase 2 就实现多窗口、多分屏全部视觉细节。
3. 本 spec 不追求完整复刻 VS Code 或 Windows Terminal 的外观。
4. 本 spec 不做 marketing homepage、品牌展示页或夸张的玻璃拟态视觉。

## 3. 总体视觉结论

Aria 的桌面端应表现为：

1. 结构上更像一个精简的 workbench。
2. 质感上更像一个现代终端应用。
3. 默认体验上更偏“长期工作空间”，而不是“多功能仪表盘”。

换句话说：

1. 采用 VS Code 风格的清晰分区、稳定边界、可预测布局。
2. 采用 Windows Terminal 风格的深色表面、克制光感、沉浸式终端主体。
3. 避免当前大面积 hero、卡片化营销层次、过圆过软的顶部交互条。

## 4. 核心设计原则

### 4.1 Workbench 优先，不做首页感

应用启动后默认进入工作台，而不是展示型首页。即使没有 session，也应该看到一个“空的终端工作台骨架”，而不是介绍性 hero 文案。

### 4.2 Terminal 是主角

终端区域是主视图，不是面板之一。侧栏、状态栏、标签栏都应该服务于终端，而不是反过来分散注意力。

### 4.3 结构克制，质感克制

允许少量深色渐变、轻微玻璃感和边缘高光，但只用于增强层次，不用于制造视觉噱头。

### 4.4 密度高于装饰

整体信息密度应接近 VS Code，而不是宽松的消费级应用。控件应紧凑、有秩序，但不能压迫。

### 4.5 面板是工具，不是卡片

会话列表、检查面板、连接页、命令面板都应是 workbench panel，而不是带大圆角和大阴影的独立卡片。

## 5. 默认布局

## 5.1 布局结论

默认采用终端优先的 A 方案：

1. 左侧保留窄活动栏。
2. 左侧主侧栏显示 sessions / workspace navigation。
3. 中间主区为终端标签 + 终端视口。
4. 右侧 inspector/utility panel 默认关闭。
5. 底部不额外打开大型 panel，默认只保留一条细状态栏。

## 5.2 默认区域划分

在典型桌面宽度下，建议默认占比为：

| 区域 | 建议宽度 | 说明 |
| --- | --- | --- |
| Activity Rail | 48-56px | 固定窄栏，只放核心入口 |
| Session Sidebar | 220-260px | 默认展开，承担 session 导航 |
| Main Terminal Region | 剩余宽度的 70%+ | 主工作区 |
| Right Utility Panel | 默认关闭 | 按需打开，建议 280-340px |

关键约束：

1. 在默认状态下，终端主区必须占据可见宽度的绝对主导地位。
2. 右侧 utility panel 不得默认打开。
3. 即使左侧 sidebar 展开，终端区视觉上仍应压过左侧导航。

## 5.3 垂直结构

主区自上而下分为：

1. 轻量标题/工具条
2. 顶部标签栏
3. 终端视口
4. 细状态栏

建议高度：

| 区域 | 建议高度 |
| --- | --- |
| Title / Toolbar | 32-36px |
| Tab Strip | 34-40px |
| Status Bar | 24-28px |

## 6. 顶部标签栏设计

## 6.1 最终选择

顶部标签栏采用 A 方案：嵌入式 workbench tabs。

不采用的方向：

1. 不采用大胶囊 tab。
2. 不采用漂浮悬置式 tab。
3. 不采用过于厚重、圆角过大的 tab bar。

选择原因：

1. 更符合“工作台”定位。
2. 与终端优先布局更兼容，不会把顶部做得像浏览器或聊天应用。
3. 更容易和未来 split、pane、observer、session attach 等复杂结构共存。

## 6.2 标签栏应有的气质

标签栏应当：

1. 平、稳、嵌入整体结构。
2. 明确区分 active / inactive。
3. 视觉上像工作面的一部分，而不是独立悬浮控件。

标签栏不应当：

1. 有强烈胶囊感。
2. 有夸张外阴影。
3. 有过大的圆角或厚度。
4. 抢走终端视口的注意力。

## 6.3 活动标签样式

活动标签建议表现为：

1. 与下方终端表面在视觉上连续。
2. 上边角轻微圆角，底边与终端区域接缝自然。
3. 背景略亮于整体 tab strip，但差值不能过大。
4. 用细色条、边框或轻度高光表示激活，不靠强饱和色块。

## 6.4 非活动标签样式

非活动标签应：

1. 明显退后于 active tab。
2. 保持可扫视、可点击。
3. hover 时只做轻微提亮，不做明显浮起。

## 6.5 标签内容

单个标签建议包含：

1. 会话标题
2. 轻量状态信息
3. 可选图标或 transport 提示
4. 悬停后出现的关闭动作

默认不建议：

1. 在标签内塞入过多 badge。
2. 常驻显示多个操作按钮。
3. 用大面积彩色状态块占据标签。

## 7. 主要工作台区域设计

## 7.1 Activity Rail

Activity Rail 应接近 VS Code 的角色：

1. 固定窄栏。
2. 图标尺寸统一。
3. 使用竖向活跃指示条，而不是大背景块。
4. 入口数量保持克制。

Phase 2 默认建议入口：

1. Sessions
2. Connections
3. Search / History
4. Settings

AI、插件等入口后续可加入，但不应在 Phase 2 默认塞满。

## 7.2 Session Sidebar

Session Sidebar 是默认展开的主导航区，不是视觉花哨的卡片墙。

应采用：

1. 清晰的分组标题
2. 紧凑的 session rows 或 tile-list
3. 轻量状态点、transport 标签、尺寸或 cwd 次级信息

不应采用：

1. 大圆角浮卡
2. 重阴影
3. 过多多行说明文案

它的角色更像 explorer / session navigator，而不是 dashboard feed。

## 7.3 Main Terminal Region

主终端区域是视觉中心，应体现 Windows Terminal 式沉浸感，但仍受工作台结构约束。

具体要求：

1. 背景更深、更纯，明显区别于侧栏。
2. 边框和层次尽量弱化，让用户感觉自己在看“终端表面”。
3. 终端表面可以有极轻微纵向渐变，但不能像 hero 背景。
4. 终端视口尽量完整、连续，不被多余边框切碎。

## 7.4 Status Bar

底部状态栏应保持细、稳、工具化。

建议承载：

1. 当前 session 状态
2. 编码、尺寸、shell / transport 信息
3. attach / detached / observer 等状态

不应做成：

1. 粗条幅
2. 彩色提醒栏
3. 第二个工具栏

## 7.5 Right Utility Panel

右侧 utility panel 保留为后续 inspector、metadata、AI context、search result 等面板的扩展区，但默认关闭。

打开后也应：

1. 显示为紧贴主区的 docked panel。
2. 继续保持 workbench 感，而不是浮层卡片。
3. 在视觉上低于终端主区。

## 8. 视觉语言与材质

## 8.1 整体色彩方向

默认主题采用深色工作台：

1. 主色调为冷灰、墨蓝、深炭黑。
2. 强调色以冷蓝为主，辅以少量青色或绿色用于成功状态。
3. 避免高饱和紫色、霓虹渐变和大面积彩色背景。

建议默认语义色：

| 角色 | 建议色向 |
| --- | --- |
| Accent | 冷蓝 |
| Success | 偏青绿 |
| Warning | 暖琥珀 |
| Danger | 柔和红 |

## 8.2 建议色板

以下为默认主题建议 token：

```text
--bg-app: #0b0f14
--bg-elevated: #11161d
--bg-sidebar: #121821
--bg-tabstrip: #0f141b
--bg-tab-active: #1a212b
--bg-terminal: #05080d
--bg-terminal-top: #0a0f17
--border-soft: #202734
--border-strong: #313a49
--text-primary: #e6edf3
--text-secondary: #9aa7b5
--text-muted: #6f7c8d
--accent: #4ea1ff
--accent-muted: #1c3552
--success: #55c08a
--warning: #d6a45f
--danger: #d76c6c
```

## 8.3 光感与透明度

允许有少量 Windows Terminal 式质感，但应严格控制：

1. 仅外层 chrome 或非终端面板可用轻微半透明。
2. 终端主表面应以稳定不透明为主。
3. 阴影应短、淡、近，不做漂浮卡片感。
4. 高光只用于边缘和激活态，不能形成 glossy 质感。

## 8.4 圆角与边框

建议圆角体系：

1. 外层 panel：8-12px
2. 标签：6-8px 顶角
3. 行级交互项：6-8px
4. 终端主表面：小圆角或几乎无圆角

边框应以 1px 微弱分割为主，不依赖粗描边。

## 9. 字体与图标

## 9.1 UI 字体

UI 字体目标是现代、冷静、专业，偏桌面工具气质。

建议：

1. Windows 上优先 `Segoe UI Variable`
2. 其他平台可回退到 `Geist Sans` 或同级现代无衬线字体

要求：

1. 数字、标签、导航文本都要有稳定的中性气质。
2. 避免过于圆润或消费级的 UI 字体。

## 9.2 终端字体

默认终端字体建议：

1. `Cascadia Mono` 或 `Cascadia Code`

原因：

1. 与 Windows Terminal 的气质接近。
2. 适合 Windows 平台。
3. 对终端界面识别度高。

## 9.3 图标

图标应采用简洁、偏工具化的线性图标。

要求：

1. 尺寸统一在 16-18px 区间。
2. 活跃态靠位置、亮度、细指示条体现，不靠图标形变。
3. 不使用填充感太强或拟物风格图标。

## 10. 交互状态与动效

## 10.1 动效原则

动效应只服务于方向感和状态感，不做表演。

建议时长：

1. hover / focus：80-120ms
2. panel collapse / expand：120-180ms
3. tab switch：尽量即时或极轻过渡

不采用：

1. 弹跳
2. 大位移动画
3. 模糊拖影

## 10.2 必须清晰表达的状态

Phase 2 至少要能通过界面表达：

1. session running / exited / failed
2. attach 中 / 已附着 / 断连
3. observer / interactive viewer
4. 当前标签激活态
5. sidebar 选中态

这些状态应主要靠：

1. 文字
2. 小型状态点
3. 边框/亮度变化
4. 细色条

而不是大面积彩色底。

## 11. 响应式与窗口缩放

虽然这是桌面应用，但仍需处理窄窗口：

1. 窗口变窄时，优先保持终端主区。
2. 右侧 panel 最先自动收起。
3. Session Sidebar 次之，可折叠为 overlay drawer。
4. Activity Rail 最后保留。

在任何宽度下，默认都不应让顶部 tab bar 变成厚重多层结构。

## 12. 对当前 UI 的替代要求

当前 `apps/aria-desktop/src/App.tsx` 和 `apps/aria-desktop/src/styles.css` 展示出的视觉模式，在 Phase 2 应整体退出默认界面。

需要被替代的特征：

1. 大 hero 标题区
2. landing page 式首屏文案
3. 放射状背景渐变作为主要视觉主题
4. 多张大圆角玻璃卡片组成的首页结构

需要引入的特征：

1. workbench shell
2. 左 rail + 左 sidebar + 主 terminal region
3. 嵌入式顶部 tab strip
4. 终端优先的深色主表面
5. 细工具栏与细状态栏

## 13. Phase 2 验收标准

完成后，默认桌面界面应满足：

1. 打开应用时，用户第一眼看到的是工作台骨架，而不是 dashboard。
2. 终端主区在默认状态下占据 70% 以上的视觉权重。
3. 左侧 sidebar 可见，但不会压过终端主区。
4. 顶部标签栏采用嵌入式结构，不是胶囊式漂浮标签。
5. 默认主题为深色、冷静、专业，具有轻微 Windows Terminal 式沉浸感。
6. 视觉层次主要依赖结构和材质，而不是大面积营销式渐变。
7. 整体观感更接近“终端工作台”，而不是“项目首页”。

## 14. 本 spec 的最终结论

Aria 的 Phase 2 前端默认界面应确定为：

1. 工作台式结构，而非首页式结构。
2. 终端优先的 A 布局。
3. 嵌入式 A 标签栏。
4. VS Code 式分区秩序。
5. Windows Terminal 式深色沉浸表面。

这份 spec 是后续 renderer 宿主 UI、session sidebar、tab strip、status bar 和主题 token 的统一视觉边界。
