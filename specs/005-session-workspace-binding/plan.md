# 实施计划：飞书会话工作区绑定

**分支**: `005-session-workspace-binding` | **日期**: 2026-03-09 | **规格说明**: [spec.md](/Users/pipi/workspace/carvis/specs/005-session-workspace-binding/spec.md)
**输入**: 来自 `/specs/005-session-workspace-binding/spec.md` 的功能规格说明

**说明**: 本模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/plan-template.md`。

## 摘要

本功能在保持 `chat_id -> session` 现有边界不变的前提下，引入 session 级 workspace 解析与绑定层。私聊默认解析到 `managedWorkspaceRoot` 下的 `defaultWorkspace`；群聊先命中 session 手动绑定，再命中静态 `chat_id -> workspace` 映射；若都未命中，则普通消息不创建 run、不入队，而是返回引导提示。`/bind` 新增“有则绑定、无则按默认 template 创建并绑定”的入口，且在有活动运行时拒绝切换 workspace。默认 template 不再是占位目录，而是最小可工作的 starter 骨架。  

同时，飞书命令 UX 参考 OpenClaw 的文本命令模式：不依赖平台原生命令菜单，而是通过应用层消息协议识别 `/bind`、`/status`、`/new`、`/help`。技术方案要求 webhook 与 websocket 共用等价的命令归一化规则，先剥离 mention 前缀和飞书消息包装，再做命令路由；对于未知 slash 命令返回帮助提示，而不是落入普通 agent 运行。

技术方案是在 `packages/core` 中新增 `WorkspaceCatalogEntry`、`SessionWorkspaceBinding` 及相应仓储/配置模型，让 gateway 在入站阶段先解析 workspace，再决定是否创建 run；executor 和 `bridge-codex` 继续消费解析后的 `run.workspace`，从而保持现有 queue/lock/heartbeat/cancel 生命周期基本不变。

## 技术上下文

- **语言/版本**: Bun 1.x、TypeScript 5.x
- **主要依赖**: Hono、Zod、PostgreSQL client、Redis coordination、Feishu websocket、Codex CLI
- **存储**: PostgreSQL、Redis、host-local managed workspaces
- **测试**: `bun test`、`bun run lint`
- **目标平台**: 本地双进程 runtime（gateway + executor），Feishu webhook / websocket inbound
- **项目类型**: gateway、executor、shared package、adapter package、bridge package
- **渠道范围**: Feishu
- **智能体范围**: Codex
- **运行拓扑**: gateway 负责 inbound、命令路由、workspace 解析、queue 入队与通知；executor 负责按解析后的 workspace 执行 run，并继续通过 queue/lock/heartbeat 保证单 workspace 单活动运行
- **可观测性**: 结构化 runtime logs、持久化 runs/events/deliveries、`/status` operator-visible 状态、gateway healthz、命令归一化与未知 slash 命令日志
- **性能目标**: 群聊未绑定拒绝路径应在一次入站处理内返回，不进入 executor；workspace 解析不得增加额外的跨进程协调回路
- **约束条件**: one active run per workspace、webhook/websocket-only inbound、Postgres 为事实来源、Redis 仅作协调、host-local managed workspaces、`/new` 不能改变 workspace binding、飞书命令必须作为文本消息协议处理、默认私聊 workspace 不得直接指向业务仓库根目录
- **规模/范围**: 单 agent、多飞书 chats、全局唯一 workspace key、单 executor 起步；不引入群内 thread/conversation 路由

## 宪法检查

*门禁：在 Phase 0 research 开始前必须通过；在 Phase 1 design 后重新检查。*

- [ ] **Boundary Integrity**: Impacted `ChannelAdapter`, `AgentBridge`, `apps/*`, and `packages/*`
      changes are explicit, and no direct channel-specific or agent-specific control flow leaks
      into shared runtime code.
- [ ] **Durable Lifecycle**: Canonical entities, run events, persistence effects, and admin
      visibility changes are documented for this feature.
- [ ] **Workspace Safety**: Locking, queueing, cancellation, timeout, and heartbeat behavior are
      defined or explicitly confirmed unchanged.
- [ ] **Operability**: Logging, retries, notifications, and operator/runbook effects are
      described for every changed execution path.
- [ ] **Verification**: Contract tests and integration tests are identified for each affected
      adapter, bridge, or run-lifecycle seam.

**Phase 0 结论**:

- [x] **Boundary Integrity**: `packages/channel-feishu` 继续只做入站归一化；workspace 解析与绑定抽象进入 `packages/core`/`apps/gateway`，`bridge-codex` 继续只消费 `RunRequest.workspace`。
- [x] **Durable Lifecycle**: 新增 session 级 workspace 绑定与 workspace catalog 持久化，群聊未绑定拒绝路径和 `/bind` 结果通过持久化状态与出站消息体现。
- [x] **Workspace Safety**: queue/lock/cancel/heartbeat 仍按解析后的 `run.workspace` 工作；未绑定群聊不创建 run，因此不影响 executor 生命周期。
- [x] **Operability**: `/status`、结构化日志和持久化投递将暴露 workspace 来源、绑定结果、创建失败、拒绝执行原因，以及 heartbeat 失效后的绑定可见性；命令归一化和未知 slash 命令也会有明确日志。
- [x] **Verification**: 已识别需要新增/更新的 contract、integration、unit 覆盖，覆盖 session 路由、workspace 解析、`/bind`、未绑定拒绝、queue/lock 语义以及 heartbeat 失效后的 status 可见性。

## 项目结构

### 文档产物（本功能）

```text
specs/005-session-workspace-binding/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### 源码结构（仓库根目录）

```text
apps/
├── gateway/
└── executor/

packages/
├── core/
├── channel-telegram/
├── channel-feishu/
├── bridge-claude-code/
└── bridge-codex/

tests/
├── contract/
├── integration/
└── unit/
```

**结构决策**:

- 修改 `packages/core`：扩展 runtime config、领域模型、仓储接口与迁移，新增 workspace catalog / session binding 能力，并允许 operator 将 `defaultWorkspace` 指向托管默认目录。
- 修改 `apps/gateway`：在普通消息和命令路由前解析 workspace，并在 `/status` 输出绑定来源，同时新增 `/help` 与未知 slash 命令提示。
- 保持 `apps/executor` 只消费已解析的 `run.workspace`，仅在必要时适配新的状态字段或日志上下文。
- 修改 `packages/channel-feishu`：抽取统一的文本命令归一化逻辑，保证 webhook/websocket 在 mention 场景下命令识别一致；不引入新的渠道特有运行语义。
- 调整测试与 operator 默认夹具：默认私聊 workspace 改为托管目录，template 夹具改为最小可工作的 starter 骨架。

## 复杂度追踪

> **仅当宪法检查存在必须说明的例外时填写**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
