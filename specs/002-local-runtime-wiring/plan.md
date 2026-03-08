# 实施计划：本地运行时接入

**分支**: `002-local-runtime-wiring` | **日期**: 2026-03-08 | **规格说明**: [spec.md](/Users/pipi/workspace/carvis/specs/002-local-runtime-wiring/spec.md)
**输入**: 来自 `/specs/002-local-runtime-wiring/spec.md` 的功能规格说明

**说明**: 本模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/plan-template.md`。

## 摘要

在不扩展产品交互范围的前提下，把现有 Feishu + Codex MVP 从“测试内可验证”推进到“本地单机双进程可真实联调”。`gateway` 和 `executor` 将分别启动，读取同一份 `~/.carvis/config.json` 与环境变量，连接真实 Postgres / Redis，并继续复用既有队列、锁、取消、heartbeat、通知与运行生命周期语义；Feishu 入站对齐 `openclaw`，本轮仅支持 `websocket`。

## 技术上下文

- **语言/版本**: Bun 1.3.x、TypeScript 5.9.x
- **主要依赖**: Hono、Postgres client、Redis client、Feishu HTTP API、Codex CLI
- **存储**: PostgreSQL、Redis、`~/.carvis/config.json`
- **测试**: `bun test`
- **目标平台**: 本地单机开发环境、Feishu websocket runtime、本机 CLI 执行环境
- **项目类型**: gateway、executor、shared package、adapter package、bridge package
- **渠道范围**: Feishu
- **智能体范围**: Codex
- **运行拓扑**: 双进程本地启动，`gateway` 负责 Feishu websocket 入站、`healthz` 与通知，`executor` 负责消费、执行、取消和 heartbeat
- **可观测性**: 结构化日志、健康检查、启动失败原因、run state、delivery state、heartbeat expiry
- **性能目标**: `gateway` 在启动后 5 秒内返回健康状态；`executor` 在启动后 10 秒内明确依赖连接结果；本地端到端真实联调在 10 分钟内可完成
- **约束条件**: one active run per workspace、双进程手动启动、配置文件与环境变量分离、保持既有 `/status`、`/abort` 和普通消息语义不变
- **规模/范围**: 单机单 agent、本地单 executor 起步、一个 Feishu app 接入、一个默认 workspace

## 宪法检查

*门禁：在 Phase 0 research 开始前必须通过；在 Phase 1 design 后重新检查。*

- [x] **Boundary Integrity**: 改动集中在 `apps/gateway`、`apps/executor`、`packages/core`、`packages/channel-feishu`、`packages/bridge-codex`，不新增跨边界的渠道或智能体特定分支泄漏。
- [x] **Durable Lifecycle**: 本功能保持现有 `Session`、`Run`、`RunEvent`、`OutboundDelivery` 的持久化实体不变，只补真实运行时接入、启动状态和本地联调入口。
- [x] **Workspace Safety**: 单工作区单活动运行、FIFO、取消、超时和 heartbeat expiry 语义不变，只把这些语义接到真实启动流程和真实依赖。
- [x] **Operability**: 计划明确覆盖启动失败、配置错误、依赖连接失败、健康检查、日志和本地联调路径。
- [x] **Verification**: 计划包含启动配置、健康检查、真实依赖接入、运行时联调、adapter/bridge/run-flow 的契约与集成验证。

## 项目结构

### 文档产物（本功能）

```text
specs/002-local-runtime-wiring/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── runtime-http.md
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

**结构决策**: 本功能不新增新的 app 或 package，继续在既有 `apps/gateway`、`apps/executor`、`packages/core`、`packages/channel-feishu`、`packages/bridge-codex` 内完成 runtime wiring。核心新增内容包括启动配置加载、Feishu `websocket` 接线、真实依赖客户端接线、健康/就绪状态暴露、本地双进程启动流程和 quickstart 联调路径。

## 复杂度追踪

当前无已知例外。
