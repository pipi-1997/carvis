# 实施计划：飞书会话内资源发送

**分支**: `014-feishu-media-delivery` | **日期**: 2026-03-18 | **规格说明**: [spec.md](/Users/pipi/workspace/carvis/.worktrees/feishu-media-delivery/specs/014-feishu-media-delivery/spec.md)
**输入**: 来自 `/specs/014-feishu-media-delivery/spec.md` 的功能规格说明，以及 2026-03-18 的真实 Feishu e2e 反馈

## 摘要

本功能的底层发送链路已经能够跑通，但 e2e 证明当前设计把过多接线细节泄漏给了 agent：它会暴露 PATH、worktree、`bun` 和 `runId`，并错误地把 CLI 调试流程当成产品主路径。本次修订后的目标不是重做发送链路，而是把能力重新收敛为“agent 在当前 session 内直接发送资源”的产品契约，并把 `carvis-media` 降到“稳定 transport / 调试入口”的层级。实现上继续保留 `skill -> transport -> gateway internal run tool -> media delivery service -> Feishu adapter` 这条链路，但要求 transport 在当前 agent shell 中零额外接线可用，运行时上下文由可信路径恢复，gateway 继续承担会话边界、审计、失败分层与最终投递语义。

## 当前修订范围

本计划以当前分支已有实现为基线，只覆盖从“已经能发送”走向“agent 真会用、文档与行为一致、运维可排障”的剩余差距。已落地的 durable audit、session 硬边界、图片/文件发送、source 支持和 Feishu 上传/发送分层不重复规划为从零建设任务。

## 技术上下文

- **语言/版本**: Bun 1.x、TypeScript 5.x
- **主要依赖**: Hono、PostgreSQL client、Redis client、Feishu OpenAPI、Codex CLI
- **存储**: PostgreSQL、Redis、宿主机本地文件系统
- **测试**: `bun test`、`bun run lint`、契约测试、集成测试、真实 Feishu e2e、`git diff --check -- .`
- **目标平台**: 本地单机双进程 runtime、Feishu websocket 入站、Feishu OpenAPI 出站、Codex CLI shell/tool 调用
- **项目类型**: gateway、executor、shared package、adapter package、bridge package、CLI package、skill package
- **渠道范围**: Feishu
- **智能体范围**: Codex
- **运行拓扑**: `executor` 继续在活动 run 内通过 gateway tool relay 执行 agent tool call；`gateway` 继续承载内部 run tool 路由与 durable write；queue / lock / cancel / timeout / heartbeat 语义明确保持不变
- **可观测性**: 结构化 runtime logger、`RunEvent(agent.tool_call/result)`、既有 `OutboundDelivery`、`RunMediaDelivery` audit、operator 查询面，以及 transport wiring 失败诊断
- **性能目标**: 对明确媒体交付请求，agent 应在正常 happy path 中直接触发一次媒体发送，不进入多轮环境排查
- **约束条件**: one active run per workspace、Postgres 作为 durable truth、Redis 仅作协调、资源发送只能回到当前 session、不得新增跨 chat 发送入口、不得把 Feishu 专属逻辑泄漏到 `executor` 或 `bridge-codex`
- **规模/范围**: 单渠道 Feishu、单 bridge Codex、活动聊天 run 内的图片/文件资源发送；不包含 scheduler 主动推送、不包含其他 channel、不包含跨 session 分享资源

## 修订后的设计要点

### 1. agent-facing 契约优先于 CLI 细节

产品目标是“把资源发回当前会话”，不是“教 agent 调一个复杂 CLI”。skill、prompt、quickstart 都要围绕这个能力表达，agent 正常路径只应处理资源业务参数。

### 2. `carvis-media` 是 transport，不是产品心智模型

当前可以继续用 `carvis-media send` 作为 shell transport，但它必须在当前 agent shell 中可直接执行，不能要求 agent 手工切换目录、显式包一层 `bun` 或搜索 worktree。debug flags 只属于测试和运维。

### 3. 运行时上下文由可信路径恢复，gateway 是最终权威

`runId`、`sessionId`、`chatId`、`workspace` 等上下文必须由 bridge / executor relay / 受控 shell 注入恢复，并由 gateway 再次校验。agent 不应参与授权参数拼接。

### 4. Feishu 侧继续保留上传与投递分层

当前已验证把上传失败与最终发送失败分开是必要的。本次修订不改变该决定，只要求把文档、runbook 和 operator 查询面与之对齐。

### 5. 文档必须与真实运行时保证一致

e2e 已证明“Runtime context is already resolved internally”这类文案在现状下过于乐观。修订后的交付必须以真实保证为准，不能再把未产品化的接线能力写成稳定承诺。

## 宪法检查

*门禁：在后续实现开始前通过；修订期间也必须成立。*

- [x] **Boundary Integrity**: `packages/bridge-codex` 只负责 transport discoverability 与运行时上下文注入；`apps/executor` 只负责通用 tool relay；`apps/gateway` 负责 media tool 路由与 durable service；`packages/channel-feishu` 负责渠道上传/发送语义。
- [x] **Durable Lifecycle**: 已有 `RunEvent(agent.tool_call/result)`、`RunMediaDelivery` 和 `OutboundDelivery` 继续作为持久化审计基础；本次修订只补 transport wiring 和 agent-facing 文案的一致性。
- [x] **Workspace Safety**: 不新增 run 类型，不改变 queue、lock、cancel、timeout、heartbeat 语义；所有资源发送仍附着于既有活动 run。
- [x] **Operability**: 计划显式覆盖 transport wiring 失败、上下文失效、source 失败、上传失败、发送失败，以及 token 刷新后的可审计结果。
- [x] **Verification**: 后续任务必须覆盖 skill/prompt contract、真实 shell transport、gateway 服务边界和 Feishu adapter contract，保持 adapter、bridge、run-flow 三个层面的验证。

## 项目结构

### 文档产物（本功能）

```text
specs/014-feishu-media-delivery/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── media-delivery-service.md
│   ├── media-delivery-tools.md
│   ├── media-skill.md
│   └── feishu-media-delivery.md
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
├── bridge-codex/
├── carvis-media-cli/
└── skill-media-cli/

tests/
├── contract/
├── integration/
└── unit/
```

**结构决策**: 后续实现重点仍会落在 [`packages/skill-media-cli/SKILL.md`](/Users/pipi/workspace/carvis/.worktrees/feishu-media-delivery/packages/skill-media-cli/SKILL.md)、[`apps/gateway/src/services/schedule-management-prompt.ts`](/Users/pipi/workspace/carvis/.worktrees/feishu-media-delivery/apps/gateway/src/services/schedule-management-prompt.ts)、[`packages/bridge-codex/src/cli-transport.ts`](/Users/pipi/workspace/carvis/.worktrees/feishu-media-delivery/packages/bridge-codex/src/cli-transport.ts)、[`packages/carvis-media-cli/src/command-parser.ts`](/Users/pipi/workspace/carvis/.worktrees/feishu-media-delivery/packages/carvis-media-cli/src/command-parser.ts)、[`packages/carvis-media-cli/bin/carvis-media.cjs`](/Users/pipi/workspace/carvis/.worktrees/feishu-media-delivery/packages/carvis-media-cli/bin/carvis-media.cjs)、[`apps/gateway/src/services/media-delivery-service.ts`](/Users/pipi/workspace/carvis/.worktrees/feishu-media-delivery/apps/gateway/src/services/media-delivery-service.ts) 以及相关 contract / integration tests。核心不是新增更多旁路组件，而是把已有链路产品化为稳定主路径。

## 复杂度追踪

当前无宪法例外。主要风险不在架构复杂度，而在“实现已存在但 agent-facing 契约仍然不真实”这一产品一致性缺口。
