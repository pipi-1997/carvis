# 实施计划：Feishu 卡片结果增强

**分支**: `003-feishu-cardkit-results` | **日期**: 2026-03-08 | **规格说明**: [spec.md](/Users/pipi/workspace/carvis/specs/003-feishu-cardkit-results/spec.md)
**输入**: 来自 `/specs/003-feishu-cardkit-results/spec.md` 的功能规格说明

**说明**: 本模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/plan-template.md`。

## 摘要

在保持现有 Feishu + Codex 对话闭环、队列、锁、取消和 heartbeat 语义不变的前提下，把普通请求的结果呈现升级为“单消息富文本卡片”：运行真正开始后发送一张 Feishu `interactive` 运行中卡片，并通过 CardKit 增量更新呈现接近原始 agent 输出的打字机效果；运行结束后保留该卡片并切换为完成态富文本摘要卡，在同一条消息中展示结论、主要变更、验证和下一步。若过程卡片创建失败且用户侧尚无任何成功交付，系统才允许降级为单条终态富文本消息；若卡片已成功创建，则不得再额外发送第二条成功终态消息。

## 技术上下文

- **语言/版本**: Bun 1.3.x、TypeScript 5.9.x
- **主要依赖**: Hono、`@larksuiteoapi/node-sdk`、Postgres client、Redis client、Codex CLI
- **存储**: PostgreSQL、Redis
- **测试**: `bun test`、契约测试、集成测试
- **目标平台**: 本地单机双进程 runtime、Feishu websocket 入站、Feishu CardKit / IM 出站
- **项目类型**: gateway、executor、shared package、adapter package、bridge package
- **渠道范围**: Feishu
- **智能体范围**: Codex
- **运行拓扑**: `gateway` 继续负责 Feishu websocket ingress、命令处理与出站通知；`executor` 继续负责消费、执行、取消与 heartbeat；`bridge-codex` 新增更细粒度输出事件；queue / lock / timeout / heartbeat 语义保持不变
- **可观测性**: 结构化运行日志、`RunPresentation` 持久化状态、`OutboundDelivery` 交付记录、降级原因、终态卡片送达状态、单消息约束是否被破坏
- **性能目标**: `run.started` 后 5 秒内应创建运行中卡片；过程卡片更新需要做节流与合并，避免高频噪声；终态事件产生后 3 秒内应把同一张卡片切换到完成态；仅在卡片创建失败时才允许发送单条终态兜底消息
- **约束条件**: one active run per workspace、排队请求不创建运行中卡片、正常成功路径必须满足“一次运行一条用户可见成功消息”、卡片创建失败前不得预先创建备用终态消息、过程卡片失败后不回退到阶段性文本刷屏、保持 `ChannelAdapter` / `AgentBridge` 边界
- **规模/范围**: 单机单 agent / 单 workspace 起步；多个飞书会话共享一个工作区；每次运行最多一个主过程卡片，异常时至多一个终态兜底消息

## 宪法检查

*门禁：在 Phase 0 research 开始前必须通过；在 Phase 1 design 后重新检查。*

- [x] **Boundary Integrity**: 改动会限制在 `apps/gateway`、`packages/channel-feishu`、`packages/bridge-codex`、`packages/core` 与测试层；Feishu CardKit 细节封装在 `channel-feishu`，Codex 输出粒度封装在 `bridge-codex`。
- [x] **Durable Lifecycle**: 计划新增运行呈现状态的持久化建模，并保留 `Run`、`RunEvent`、`OutboundDelivery` 的审计链路，确保卡片创建、卡片更新、终态切换、降级和单消息约束都可查询。
- [x] **Workspace Safety**: 本功能不改变 queue、lock、timeout、cancel、heartbeat 语义；仅明确“排队时不创建过程卡片，真正开始执行后才创建”。
- [x] **Operability**: 计划明确卡片创建失败、卡片更新失败、频控/节流、终态切换、异常兜底交付与运维可见状态。
- [x] **Verification**: 计划覆盖 `channel-feishu` 契约、`bridge-codex` 契约、RunEvent 到 Presentation 的集成验证、单消息约束验证，以及降级路径验证。

## 项目结构

### 文档产物（本功能）

```text
specs/003-feishu-cardkit-results/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── feishu-result-presentation.md
│   └── presentation-events.md
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

**结构决策**: 不新增新的 app 或 package。`apps/gateway` 负责将 `RunEvent` 翻译为单张 Feishu 卡片的生命周期动作和持久化呈现状态；`packages/channel-feishu` 承担 `interactive` 卡片创建、富文本增量更新、终态切换与异常兜底发送逻辑；`packages/bridge-codex` 承担输出事件粒度升级与富文本语义可恢复的最小契约；`packages/core` 承担新增数据模型与仓储扩展；测试继续落在现有 `tests/contract`、`tests/integration`、`tests/unit`。

## 复杂度追踪

当前无已知例外。
