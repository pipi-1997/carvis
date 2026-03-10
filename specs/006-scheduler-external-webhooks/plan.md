# 实施计划：调度器与外部 Webhook 触发

**分支**: `006-scheduler-external-webhooks` | **日期**: 2026-03-10 | **规格说明**: [spec.md](/Users/pipi/.config/superpowers/worktrees/carvis/006-scheduler-external-webhooks/specs/006-scheduler-external-webhooks/spec.md)
**输入**: 来自 `/specs/006-scheduler-external-webhooks/spec.md` 的功能规格说明

**说明**: 本模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/plan-template.md`。

## 摘要

本功能为 Carvis 增加两类非聊天触发源：`scheduled job` 和 `external webhook`。二者都由 operator 预定义并持久化登记，触发时统一生成 `TriggerExecution`，再进入既有 `gateway -> queue -> executor -> outbound` 执行链路。外部 webhook 只允许命中预注册 definition，并将 payload 作为固定模板变量注入；v1 不允许直接提交任意 prompt，也不允许 payload 覆盖 workspace、agent 或 delivery target。除触发和执行链路外，本轮还要补一个最小内部管理查询面，用于按 definition / execution 读取 Postgres 中的可运维状态。

技术方案是在 `packages/core` 中引入 trigger domain model、配置模型、仓储接口和 migration，并把现有 `Run` 从“必须绑定聊天 session”调整为“可选绑定 session、可选绑定 trigger execution”。`apps/gateway` 新增 definition sync、scheduler loop、external webhook ingress、内部查询 route 和统一 trigger dispatcher，负责将 due job / webhook request 转换成 canonical `RunRequest`，并把 definition / execution / run / delivery 结果以最小 operator read surface 暴露出来。`apps/executor` 继续只消费 `Run.workspace`，不感知 scheduler/webhook 细节；`gateway` 的 notifier 改为按 run 自身上下文解析聊天呈现或 trigger delivery。

v1 只支持两种 delivery 模式：`none` 和 `Feishu chat`。因此结果通知仍复用现有 `packages/channel-feishu` 出站能力，但不会为非聊天触发伪造 session，也不会默认复用任何飞书 continuation memory。

## 技术上下文

- **语言/版本**: Bun 1.x、TypeScript 5.x
- **主要依赖**: Hono、Zod、PostgreSQL client、Redis coordination、Feishu websocket / message API、Codex CLI
- **存储**: PostgreSQL、Redis、host-local workspaces、runtime config file
- **测试**: `bun test`、`bun run lint`
- **目标平台**: 本地双进程 runtime（gateway + executor），HTTP webhook ingress、gateway 内 scheduler loop、gateway 内部管理查询 API、Feishu outbound delivery
- **项目类型**: gateway、executor、shared package、adapter package、bridge package
- **渠道范围**: Scheduler、External Webhook、Feishu
- **智能体范围**: Codex
- **运行拓扑**: gateway 负责 trigger definition sync、scheduler tick、external webhook 验证、trigger execution 持久化、queue 入队与终态通知；executor 继续按 `run.workspace` 拉取队列、获取锁、维护 heartbeat/cancel/timeout 并驱动 Codex CLI
- **可观测性**: 结构化 runtime logs、持久化 trigger definitions / executions / runs / run_events / deliveries、`/healthz`、内部管理查询面、operator-visible trigger 状态、`heartbeat_expired` / timeout / cancel 失败细节、delivery 审计、missed/skipped 记录
- **性能目标**: external webhook 应在单次 HTTP 请求内完成 definition 匹配、鉴权和 payload 校验，并在 2 秒内返回 accepted/rejected；scheduled job 从 due 到 `queued` 的延迟目标不超过 60 秒；这些时延目标必须通过自动化测试或 quickstart 验证步骤验证；新增 trigger path 不得绕过既有 queue/lock
- **约束条件**: one active run per workspace、Postgres 为 durable state、Redis 仅作协调、gateway 承载 scheduler 与 webhook ingress、external webhook 仅允许预注册 definition、non-chat runs 默认 `fresh`、v1 不自动补跑 missed schedule
- **规模/范围**: 单 agent、单 gateway / 单 executor 起步、几十条 trigger definitions、分钟级 scheduler tick、单条 run 可选投递到一个 Feishu chat；不引入多 agent 选择、任意 prompt webhook、admin UI 编辑器

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

- [x] **Boundary Integrity**: scheduler 与 external webhook 保持为 gateway-owned ingress，不把它们塞进 `packages/channel-feishu`；shared runtime 只接收 canonical `TriggerDefinition` / `TriggerExecution` / `RunRequest` 数据，`bridge-codex` 继续只消费标准 `RunRequest`。
- [x] **Durable Lifecycle**: 已识别需要新增 `TriggerDefinition`、`TriggerExecution`、run trigger metadata 和 delivery target 持久化，并把 accepted/rejected/missed/skipped/terminal result 通过内部管理查询面暴露为 operator-visible 状态。
- [x] **Workspace Safety**: 所有 trigger run 继续复用现有 queue/lock/timeout/cancel/heartbeat 语义；scheduler/webhook 只决定“是否创建 run”，不改变 executor 的锁生命周期。
- [x] **Operability**: 已确定要为 definition sync、scheduler tick、webhook verify、trigger execution state、delivery result、heartbeat expiry 和 missed window 增加结构化日志与持久化状态，并通过内部管理查询面读取。
- [x] **Verification**: 已识别需要新增 contract / integration / unit 覆盖，验证 external webhook 契约、scheduler due path、sessionless run 执行、queue/lock 一致性、delivery fallback、内部管理查询面与 heartbeat 失效行为。

**Phase 1 设计后复核**:

- [x] **Boundary Integrity**: 计划将 trigger config / repositories / models 放入 `packages/core`，gateway 只做 ingress 与 orchestration，executor 仅消费扩展后的 canonical run，上述边界与宪法一致。
- [x] **Durable Lifecycle**: `research.md`、`data-model.md` 与 `contracts/` 已覆盖 definition、execution、run、delivery 之间的持久化关系与状态机。
- [x] **Workspace Safety**: `data-model.md` 与 `contracts/trigger-lifecycle.md` 明确了 queued/running/completed/failed/cancelled 与 missed/skipped 的关系，并确认 queue/lock/heartbeat 仍按 workspace 生效，heartbeat 失效会回写 trigger execution 终态。
- [x] **Operability**: `quickstart.md` 与 research 决策已定义 sync、鉴权失败、payload 校验失败、missed window、heartbeat expiry、delivery failure 的 operator 观测方式，并要求通过内部管理查询面读取。
- [x] **Verification**: 本计划已为 route contract、repository contract、run lifecycle integration、scheduler loop、webhook ingress 与内部管理查询面列出明确测试目标，可直接进入 `/speckit.tasks`。

## 项目结构

### 文档产物（本功能）

```text
specs/006-scheduler-external-webhooks/
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

- 修改 `packages/core`：扩展 runtime config、领域模型、仓储接口和 migration，新增 `TriggerDefinition` / `TriggerExecution` / optional run delivery target 能力，并允许 run 在无聊天 session 的情况下仍保持 canonical lifecycle；definition sync 必须保留 disabled 历史与 execution 历史。
- 修改 `apps/gateway`：新增 trigger definition sync、scheduler loop、external webhook route、内部 trigger 状态查询 route、trigger dispatcher、trigger-aware notifier / delivery resolver；保留 Feishu websocket/chat path 语义不变。
- 修改 `apps/executor`：适配 sessionless run 执行上下文，但继续只根据 `run.workspace`、`RunEvent` 和 `AgentBridge` 工作，不引入 scheduler/webhook 特殊分支；heartbeat expiry 必须回写 trigger execution 终态。
- 保持 `packages/channel-feishu` 只负责 Feishu 出站投递；若需要对显式 `chatId` 目标投递做轻微适配，应复用现有 sender，不新增 trigger 专用 adapter。
- 不新增 scheduler/webhook 专属 package。原因是这两类 trigger 属于 gateway 内部入口与 orchestration，而不是新的消息渠道协议实现。

## 复杂度追踪

> **仅当宪法检查存在必须说明的例外时填写**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
