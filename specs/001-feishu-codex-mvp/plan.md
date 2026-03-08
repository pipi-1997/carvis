# 实施计划：飞书 Codex 对话闭环

**分支**: `001-feishu-codex-mvp` | **日期**: 2026-03-08 | **规格说明**: [spec.md](/Users/pipi/workspace/carvis/specs/001-feishu-codex-mvp/spec.md)
**输入**: 来自 `/specs/001-feishu-codex-mvp/spec.md` 的功能规格说明

**说明**: 本模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/plan-template.md`。

## 摘要

实现一个基于 Bun 的 Feishu + Codex 最小对话执行闭环：同一个机器人可服务多个飞书 `chat` 会话，所有会话都路由到同一个本地配置声明的 Codex agent 与固定 workspace。系统需要支持普通消息触发运行、`/status` 查询、`/abort` 取消，以及基于 Postgres + Redis 的排队、锁、状态持久化和结果回推。

## 技术上下文

- **语言/版本**: Bun 1.x、TypeScript 5.x
- **主要依赖**: Hono、Feishu webhook SDK/HTTP client、PostgreSQL client、Redis client
- **存储**: PostgreSQL、Redis
- **测试**: bun test、契约测试、集成测试
- **目标平台**: Linux server、internal admin web、webhook runtime
- **项目类型**: gateway、executor、shared package、adapter package、bridge package
- **渠道范围**: Feishu
- **智能体范围**: Codex
- **运行拓扑**: gateway ingress、Redis queue、workspace lock、executor、Codex CLI、outbound delivery
- **可观测性**: 结构化日志、持久化 run state、delivery status、executor heartbeat
- **性能目标**: 入站请求在 5 秒内给出排队或启动反馈；`/status` 在 2 秒内返回持久化状态；取消请求在 10 秒内给出明确结果
- **约束条件**: one active run per workspace、webhook-only inbound、host-local workspaces、单 agent 固定 workspace、首版只做状态变化 + 阶段性摘要 + 最终结果
- **规模/范围**: 单个 Codex agent、多个 Feishu `chat` 共享同一 workspace、单 executor 实例起步

## 宪法检查

*门禁：在 Phase 0 research 开始前必须通过；在 Phase 1 design 后重新检查。*

- [x] **Boundary Integrity**: 本功能只引入 `packages/channel-feishu`、`packages/bridge-codex`、`packages/core`、`apps/gateway`、`apps/executor` 的明确职责，不在共享 runtime 中泄漏渠道特定或 agent 特定分支。
- [x] **Durable Lifecycle**: `Session`、`Run`、`RunEvent`、`OutboundDelivery` 将进入持久化模型，状态反馈和失败原因可以脱离宿主机查询。
- [x] **Workspace Safety**: 保留每个 workspace 单活动运行的规则，明确队列、锁、取消、超时与心跳失效语义。
- [x] **Operability**: 计划包含日志、重试、通知、失败原因、心跳和队列可见性相关设计，支持后续运维定位问题。
- [x] **Verification**: 计划包含 Feishu 入站归一化、Codex bridge 事件映射、运行生命周期、队列/锁和取消路径的契约与集成测试。

## 项目结构

### 文档产物（本功能）

```text
specs/001-feishu-codex-mvp/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── feishu-bot.md
│   └── run-events.md
└── tasks.md
```

### 源码结构（仓库根目录）

```text
apps/
├── gateway/
└── executor/

packages/
├── core/
├── channel-feishu/
└── bridge-codex/

tests/
├── contract/
├── integration/
└── unit/
```

**结构决策**: 本功能会落在 `apps/gateway`（飞书 webhook、session routing、outbound delivery）、`apps/executor`（消费任务、锁、心跳、取消）、`packages/core`（规范类型与存储模型）、`packages/channel-feishu`（入站/出站适配器）和 `packages/bridge-codex`（Codex CLI bridge）。暂不创建 Telegram、Claude Code、scheduler 和 admin UI 专属实现包。

## 复杂度追踪

> **仅当宪法检查存在必须说明的例外时填写**

当前无已知例外。
