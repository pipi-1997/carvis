# 实施计划：Codex 会话续聊记忆

**分支**: `004-codex-session-memory` | **日期**: 2026-03-09 | **规格说明**: [spec.md](/Users/pipi/workspace/carvis/specs/004-codex-session-memory/spec.md)
**输入**: 来自 `/specs/004-codex-session-memory/spec.md` 的功能规格说明

**说明**: 本模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/plan-template.md`。

## 摘要

本功能为现有 Feishu + Codex 主链路补上“同会话续聊记忆”：同一个飞书 `chat` 后续请求默认继续同一个 Codex 原生 session，而不是每轮都从零开始。实现上保持现有 `chat -> session -> run -> queue -> executor -> AgentBridge` 路径不变，在 `packages/core` 中新增独立的会话续聊绑定实体，由 `gateway` 读取并在创建 `RunRequest` 时带入，由 `bridge-codex` 在运行结束后回传当前有效的底层 session，并由 `executor` 在成功、显式重置或失效恢复后更新绑定。若续聊 session 不可恢复，系统仅自动重试一次新会话；若仍失败，则按既有 run.failed 语义收口。

## 技术上下文

- **语言/版本**: Bun 1.3.x、TypeScript 5.9.x
- **主要依赖**: Hono、Postgres client、Redis client、`@larksuiteoapi/node-sdk`、Codex CLI
- **存储**: PostgreSQL、Redis
- **测试**: `bun test`、契约测试、集成测试、`bunx tsc --noEmit`
- **目标平台**: 本地单机双进程 runtime、Feishu websocket 入站、Codex CLI 宿主机执行
- **项目类型**: gateway、executor、shared package、adapter package、bridge package
- **渠道范围**: Feishu
- **智能体范围**: Codex
- **运行拓扑**: `gateway` 负责 session 路由、命令解析和 `RunRequest` 构建；`executor` 继续负责排队消费、工作区锁、run heartbeat、Codex 执行与结果回写；`bridge-codex` 新增底层 session 续聊输入输出；queue / lock / timeout / heartbeat 语义保持不变
- **可观测性**: 结构化运行日志、续聊绑定持久化状态、运行失败归因、`/status` 用户可见状态、管理员可查询的绑定失效/重置/自动恢复结果，以及“运行成功但通知投递失败”与“运行本身失败”的区分
- **性能目标**: 续聊绑定读取和回写不应显著增加已有运行启动时延；检测到续聊失效时仅允许一次自动重试；`/new` 和 `/status` 响应体验保持与现有命令同量级
- **约束条件**: one active run per workspace、webhook-only inbound、host-local workspaces、固定 agent / 固定 workspace、续聊绑定不得绕过 FIFO 队列、锁、取消、超时与 run heartbeat 规则；`/new` 不得中断当前 active run；共享同一 workspace 的多个 `chat` 仍必须保持各自独立的续聊绑定
- **规模/范围**: 单 agent / 单 workspace 起步；多个飞书会话共享同一个工作区，但每个 `chat` 拥有各自独立的续聊绑定；首版不做长期记忆、历史摘要注入或跨会话记忆共享

## 宪法检查

*门禁：在 Phase 0 research 开始前必须通过；在 Phase 1 design 后重新检查。*

- [x] **Boundary Integrity**: 改动限制在 `apps/gateway`、`apps/executor`、`packages/core`、`packages/bridge-codex` 和现有测试层；Feishu 命令语义留在 `gateway` / `channel-feishu`，Codex session 细节留在 `bridge-codex`。
- [x] **Durable Lifecycle**: 计划新增独立的会话续聊绑定实体与持久化字段，明确显式重置、自动重建、失效保留和回写时机，并保持 run 历史链路可审计。
- [x] **Workspace Safety**: 本功能显式确认 queue、lock、cancel、timeout、run heartbeat 语义保持不变；续聊绑定只影响上下文延续，不影响调度。
- [x] **Operability**: 计划覆盖续聊绑定状态、失效判定、自动重试、重置命令、通知表现和管理员可见状态。
- [x] **Verification**: 计划覆盖 `bridge-codex` 契约、`gateway` 命令契约、续聊绑定持久化、自动恢复路径和端到端会话续聊验证。

## 项目结构

### 文档产物（本功能）

```text
specs/004-codex-session-memory/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── codex-session-continuation.md
│   └── feishu-session-memory-commands.md
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

**结构决策**: 不新增新的 app 或 package。`packages/core` 承担续聊绑定实体、仓储扩展和迁移；`apps/gateway` 负责把 `Session` 上下文和命令语义映射成是否续聊的 `RunRequest`；`packages/bridge-codex` 负责把底层 session 续聊输入输出封装到 `AgentBridge` 契约中；`apps/executor` 负责在运行成功、重置或失效恢复后更新绑定；测试继续落在现有 `tests/contract`、`tests/integration` 和 `tests/unit`。

## 复杂度追踪

当前无已知例外。
