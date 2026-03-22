# 实施计划：Agent 管理定时任务

**分支**: `007-agent-managed-scheduling` | **日期**: 2026-03-11 | **规格说明**: [spec.md](/Users/pipi/.config/superpowers/worktrees/carvis/specify-agent-managed-scheduling/specs/007-agent-managed-scheduling/spec.md)
**输入**: 来自 `/specs/007-agent-managed-scheduling/spec.md` 的功能规格说明

## 摘要

本功能把 `006` 已经落地的 scheduler runtime 提升为真正可用的聊天控制面：用户在当前已绑定 `workspace` 的 Feishu 对话里，可以通过自然语言或自然语音让 `Codex` 创建、查询、修改、停用和重新启用定时任务。到点后的真正执行仍然完全复用既有 `scheduler -> trigger execution -> run -> queue -> executor -> outbound` 主链路，不引入旁路执行。

本轮方案不再依赖 external MCP。技术方案分成四层。第一层是 gateway-owned `ScheduleManagementService` 与相关 durable model，作为唯一允许修改 schedule durable state 的业务执行面。第二层是 `carvis-schedule` 本地 CLI，作为 agent 可执行的 shell facade，负责参数解析、调用 gateway 内部 route、把结果映射为稳定的 `stdout JSON + exit code`。CLI 在普通 agent 路径下从当前 `Codex` 运行时自动解析 workspace、session/chat、user 和 requested text；显式 flags 仅保留给调试、测试和人工排障使用；`stderr` 仅承载调试信息，`stdout` 才承载机器可读结果。第三层是 schedule management skill package，用来约束 agent 何时调用 `carvis-schedule`、何时澄清、何时拒绝，并把 CLI 结果组织成用户可读回复。第四层是 `bridge-codex` / executor 运行时接线，只负责保证 `carvis-schedule` 可执行、注入运行时上下文并保留审计链路。本轮增量要求是把恢复启用建模为显式 `enable` 动作，并让 `list` 同时返回用户可读摘要和机器可读结构化列表。

因为本轮明确要求 `Codex` 也能修改和停用 `config` 来源的 definition，所以计划继续采用“config baseline + durable override”模型：runtime config 继续声明基础 scheduled jobs，sync 仍负责把 baseline 同步到 Postgres；一旦聊天动作修改或停用某条 definition，则把变更持久化为 override，并在 scheduler / 查询面读取 effective definition。这样既避免下一次 sync 把聊天修改覆盖掉，也能让 operator 看出某条 `config` 来源任务是否已经被 Codex 改写。

## 技术上下文

- **语言/版本**: Bun 1.x、TypeScript 5.x
- **主要依赖**: Hono、Zod、PostgreSQL client、Redis coordination、Feishu websocket / message API、Codex CLI
- **存储**: PostgreSQL、Redis、host-local workspaces、runtime config file
- **测试**: `bun test`、`bun run lint`
- **目标平台**: 本地双进程 runtime（gateway + executor）、Feishu chat ingress、gateway 内 scheduler loop、gateway 内部管理查询与写入面
- **项目类型**: gateway、executor、shared package、adapter package、bridge package、CLI package、skill package
- **渠道范围**: Feishu、Scheduler、internal admin query surface
- **智能体范围**: Codex
- **运行拓扑**: gateway 继续负责 Feishu ingress、workspace 解析、schedule definition sync、scheduler tick、内部管理面与 outbound；executor 继续只按 canonical `RunRequest` 执行 Codex CLI，不直接感知 schedule 业务规则；真正的 schedule 执行依旧在既有 queue/lock/heartbeat 体系内运行
- **可观测性**: 结构化 runtime logs、持久化 schedule definitions / overrides / management actions / trigger executions / runs / deliveries、tool call / tool result 事件、`/healthz`、内部查询面、operator-visible management audit 和 trigger 状态
- **性能目标**: chat 中的 create/list/update/disable/enable 应在单次 Codex 轮次内返回最终用户可见结果；scheduler run 触发行为继续满足 `006` 的 due-to-queued 60 秒预算；schedule 管理动作落库后，后续 list 与内部查询面应立即反映 effective 状态
- **约束条件**: one active run per workspace、Postgres 为 durable state、Redis 仅作协调、非聊天 trigger 仍默认 `fresh`、gateway 是唯一 schedule durable 执行面、`carvis-schedule` 只是 shell facade、skill 不得直接写 durable state、是否调用 CLI 由 agent 自主判断、当前 chat 未绑定 workspace 时不得执行 schedule 管理动作、bridge 启动期必须探测 `carvis-schedule` 可执行性
- **规模/范围**: 单 gateway / 单 executor 起步、单 workspace 下几十条 schedules、自然语言只覆盖当前 scheduler 已支持的分钟级重复模式、单轮最多执行一个 schedule 管理动作，不支持批量操作

## 宪法检查

- [x] **Boundary Integrity**: 计划把 schedule 管理逻辑收敛在 gateway-owned `ScheduleManagementService` 与 presenter 中；`carvis-schedule` 只是 gateway 内部 route 的 shell facade，skill 是调用策略层；`packages/channel-feishu` 继续只负责入站归一化与出站投递。
- [x] **Durable Lifecycle**: 已识别需要新增 CLI gateway client、stdout/exit code 契约，以及从 management action 到 trigger execution / run / delivery 的持久化反查链路。
- [x] **Workspace Safety**: schedule 管理动作本身不直接绕过 queue/lock；只有后续 scheduler 触发出的 run 才进入既有 workspace 串行化与 heartbeat 语义。chat 中 create/update/disable 只是控制面写操作。
- [x] **Operability**: 已确定要为 create/list/update/disable/enable 结果、澄清拒绝、config definition override、effective schedule 读取、scheduler 触发与 delivery 结果增加结构化日志和 operator-visible 状态。
- [x] **Verification**: 已识别需要新增 contract / integration 覆盖，验证 `carvis-schedule` CLI contract、内部上下文解析、skill 调用策略、语音 transcript 与文本等价、workspace-scope 约束、未绑定 workspace 时的拒绝与 `/bind` 引导、config override 持久化、scheduler 读取 effective definition、歧义修改/取消澄清，以及 operator 查询面对 management audit / tool call / run / delivery 结果的投影一致性。

## 项目结构

### 文档产物（本功能）

```text
specs/007-agent-managed-scheduling/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md

docs/
└── runbooks/
    └── schedule-management.md
```

### 源码结构（仓库根目录）

```text
apps/
├── gateway/
└── executor/

packages/
├── core/
├── channel-feishu/
├── bridge-codex/
├── carvis-schedule-cli/
└── skill-schedule-cli/

tests/
├── contract/
├── integration/
└── unit/
```

## 结构决策

- 修改 `packages/core`：继续复用 definition origin / override / management action / definition label 等 durable state；scheduler 继续读取 effective definition。
- 修改 `apps/gateway`：继续保留 `ScheduleManagementService`、workspace-scoped matcher、内部 schedule 管理 route / presenter，并让 trigger sync / scheduler loop 读取 override 后的 effective state；gateway 继续作为唯一业务写入面。
- 新增 `packages/carvis-schedule-cli`：提供 `create/list/update/disable/enable` 五个子命令、gateway client、内部上下文解析、可选调试 flags，以及统一 `stdout JSON` / `stderr debug` / `exit code` 契约。
- 新增 `packages/skill-schedule-cli`：提供 schedule management skill，指导 agent 使用 `carvis-schedule`。
- 修改 `packages/bridge-codex` / `apps/executor`：移除 external MCP 依赖与 probe，改为 CLI readiness 检查、shell 路径可达性保证，以及对 schedule tool call / tool result / not-invoked 状态的审计接线。
- 保持 `packages/channel-feishu` 无 schedule 特殊逻辑。自然语音仍先被视为 transcript 文本再进入相同 prompt 路径，不新增 Feishu adapter 专用 schedule 分支。

## 复杂度追踪

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
