# carvis

`carvis` 把 Feishu 对话、Codex 执行和本地双进程 runtime 串起来，提供一条面向 operator 的 agent 运行路径。它的重点不是“做一个通用聊天机器人”，而是让你能在本机可控地运行、排障和管理一个带续聊、sandbox mode 和 schedule 管理能力的工作流 agent。

## 适合谁

- 想把 Feishu 群聊接到本地 `Codex CLI`
- 想保留本地 runtime、Postgres、Redis 和日志可见性
- 想要同 chat 续聊、单 workspace 串行执行和显式 sandbox 控制
- 想把提醒 / 调度管理交给 agent，但仍保留 operator 侧的控制面和排障面

不太适合：

- 想直接用托管 SaaS
- 想要多渠道、多模型、多租户平台能力
- 只需要一个轻量 webhook bot，而不需要 run lifecycle、锁、队列和 operator CLI

## Installation

### 1. 准备依赖

先确认本机具备：

- `bun --version`
- `codex --version`
- 可访问的 PostgreSQL
- 可访问的 Redis
- 已配置好 Feishu 应用，并启用 `websocket` 长连接事件订阅

### 2. 安装仓库依赖

```bash
bun install
```

### 3. 首次引导

在仓库根目录执行：

```bash
bun run --filter @carvis/carvis-cli carvis onboard
```

它会：

- 收集 Feishu 和 runtime 所需配置
- 写出 `~/.carvis/config.json` 与 `~/.carvis/runtime.env`
- 自动继续执行 `carvis start`

更完整的安装与运维路径见 [docs/guides/operator-handbook.md](docs/guides/operator-handbook.md)。

## Get Started

### 本地 runtime

```bash
bun run --filter @carvis/carvis-cli carvis status
bun run --filter @carvis/carvis-cli carvis doctor
```

### Feishu 会话内

在群聊里先绑定 workspace：

```text
/bind <workspace-key>
```

日常高频命令：

- `/status`
- `/mode`
- `/new`
- `/abort`

完整指令说明见 [docs/reference/reference-chat-commands.md](docs/reference/reference-chat-commands.md)。

## Why carvis

- 本地可控 runtime
  - `gateway` 和 `executor` 双进程运行，配置、状态和日志都在本地可见
- 同 chat 续聊
  - 默认续用底层 Codex session，`/new` 可显式重置
- 单 workspace 串行执行
  - 每个 workspace 同时只允许一个 active run，并保留显式队列 / 锁语义
- sandbox mode 可控
  - 既有 workspace 默认 mode，也支持 chat 级临时 override
- schedule 管理可交给 agent
  - 通过 `carvis-schedule` 控制面完成 create / list / update / disable
- operator 友好
  - 自带 `onboard/start/stop/status/doctor/configure` 和专题 runbook

## Choose Your Path

- 我想先把系统跑起来
  - 看 [docs/guides/operator-handbook.md](docs/guides/operator-handbook.md)
- 我想理解当前实现和边界
  - 看 [docs/architecture.md](docs/architecture.md)
- 我想开始改代码
  - 看 [docs/guides/developer-onboarding.md](docs/guides/developer-onboarding.md)
- 我想查稳定命令 / 配置 / 会话指令
  - 看 [docs/reference/reference-cli.md](docs/reference/reference-cli.md)
  - 看 [docs/reference/reference-config.md](docs/reference/reference-config.md)
  - 看 [docs/reference/reference-chat-commands.md](docs/reference/reference-chat-commands.md)
- 我想做专题排障
  - 看 [docs/runbooks/schedule-management.md](docs/runbooks/schedule-management.md)

完整文档路由见 [docs/index.md](docs/index.md)。

## Current Scope

当前实现包括：

- Feishu `websocket` 入站与消息发送
- `Codex CLI` 新会话与续聊执行
- `gateway` + `executor` 双进程本地 runtime
- 单 workspace 单活动运行与显式队列 / 锁语义
- `/bind`、`/status`、`/mode`、`/new`、`/abort`
- 运行中卡片、终态摘要卡和异常兜底消息
- operator-facing `carvis onboard/start/stop/status/doctor/configure`

当前不包括：

- 多渠道适配器
- 云端托管部署说明
- 未落地 spec 的完整产品化能力

## Repo Snapshot

```text
apps/        gateway + executor
packages/    core, channel-feishu, bridge-codex, carvis-cli, carvis-schedule-cli
tests/       unit, contract, integration
docs/        guides, reference, runbooks, plans, architecture
specs/       设计档案
```

## 开发说明

本仓库以中文文档为主。涉及运行生命周期、adapter、bridge 或 run-flow 的变更时，需同步补齐 contract 和 integration coverage，详细约束见 [AGENTS.md](AGENTS.md)。
