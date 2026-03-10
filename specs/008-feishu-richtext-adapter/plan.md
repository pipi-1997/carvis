# 实施计划：Feishu 稳定富文本适配

**分支**: `008-feishu-richtext-adapter` | **日期**: 2026-03-10 | **规格说明**: [spec.md](/Users/pipi/workspace/carvis/specs/008-feishu-richtext-adapter/spec.md)
**输入**: 来自 `/specs/008-feishu-richtext-adapter/spec.md` 的功能规格说明

**说明**: 本模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/plan-template.md`。

## 摘要

本功能在不改变 `ChannelAdapter`、`AgentBridge`、队列、锁、取消、超时、heartbeat 和单消息卡片主语义的前提下，为 `packages/channel-feishu` 增加统一的富文本稳定化转换层。该转换层在 Feishu 出站发送前接收上游原始累计文本，根据流式与终态两种模式做一致的结构解析、白名单标签保留和不兼容语法降级，再映射为飞书可稳定渲染的卡片元素。`apps/gateway` 继续只负责规范事件到呈现动作的编排，`packages/channel-feishu` 负责 Feishu 专属渲染语义，`packages/core` 仅在需要时扩展日志或交付可观测字段，优先避免新的持久化模型或运行拓扑变化。

## 技术上下文

- **语言/版本**: Bun 1.x、TypeScript 5.x
- **主要依赖**: Hono、PostgreSQL client、Redis client、Feishu OpenAPI、Codex CLI
- **存储**: PostgreSQL、Redis
- **测试**: `bun test`、`bun run lint`、契约测试、集成测试、`git diff --check -- .`
- **目标平台**: 本地单机双进程 runtime、Feishu `interactive` / `post` 出站、Feishu websocket 入站
- **项目类型**: gateway、executor、shared package、adapter package、bridge package
- **渠道范围**: Feishu
- **智能体范围**: Codex
- **运行拓扑**: `gateway` 继续维护 `run.started` / `agent.output.delta` / 终态事件到呈现动作的映射；`executor` 与 `bridge-codex` 不新增 Feishu 专属逻辑；queue / lock / timeout / cancel / heartbeat 语义明确保持不变
- **可观测性**: 结构化运行日志、`RunPresentation` / `OutboundDelivery` 既有持久化状态、Feishu 渲染降级阶段记录、单消息卡片约束审计
- **性能目标**: 不额外增加用户可感知的出站等待；运行中卡片更新继续基于累计文本节流；终态卡片继续复用同一消息完成切换；渲染转换必须在单次出站更新内完成
- **约束条件**: one active run per workspace、Postgres 作为持久化真值、Redis 只作协调、不得把 Feishu 渲染规则上移到 `gateway` 或 `bridge-codex`、不得把适配层演变为摘要器、正常成功路径必须维持单消息卡片语义
- **规模/范围**: 单渠道 Feishu、现有普通请求运行链路、流式卡片更新和终态卡片切换两条呈现路径；不涉及 scheduler、external webhook、其他 channel

## 宪法检查

*门禁：在 Phase 0 research 开始前必须通过；在 Phase 1 design 后重新检查。*

- [x] **Boundary Integrity**: 改动限制在 `packages/channel-feishu`、`apps/gateway`、必要的 `packages/core` 与测试层；Feishu 富文本稳定化只在渠道包内实现，不向共享运行控制流泄漏平台分支。
- [x] **Durable Lifecycle**: 本功能不引入新的运行生命周期阶段；会复用 `RunPresentation`、`OutboundDelivery` 和结构化日志记录转换、降级和兜底交付结果，并在文档中明确这些 operator-visible outcome。
- [x] **Workspace Safety**: queue、lock、cancel、timeout、heartbeat 语义明确保持不变；本功能只增强 Feishu 出站呈现，不增加新的执行器控制路径。
- [x] **Operability**: 计划覆盖转换成功、局部降级、卡片更新失败、终态增强失败和兜底交付的日志与可见状态，确保运维可区分失败阶段。
- [x] **Verification**: 计划新增 `channel-feishu` 单元与契约测试，并补齐 `gateway` 集成测试，覆盖流式转换、终态转换、失败降级和单消息约束。

## 项目结构

### 文档产物（本功能）

```text
specs/008-feishu-richtext-adapter/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── feishu-rendering-boundary.md
│   └── feishu-richtext-transform.md
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

**结构决策**: 不新增新的 app、bridge 或 channel 包。`packages/channel-feishu` 新增独立的富文本转换模块和卡片内容映射模块，并由 [`runtime-sender.ts`](/Users/pipi/workspace/carvis/packages/channel-feishu/src/runtime-sender.ts) 调用；`apps/gateway` 保持 `presentation-orchestrator` 的事件编排职责，仅继续传递累计文本；`packages/core` 只在现有 delivery / presentation 可观测语义不足时做最小补充；验证继续落在现有 `tests/unit`、`tests/contract` 和 `tests/integration`。

## 复杂度追踪

当前无已知例外。
