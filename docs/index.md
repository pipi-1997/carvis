# 文档导航

本页是 `carvis` 的 docs 总入口。建议按你的任务选择阅读路径，而不是从 `specs/` 编号目录开始。

## 从哪里开始

### 我想先把系统跑起来

先看：

1. [../README.md](../README.md)
2. [guides/operator-handbook.md](guides/operator-handbook.md)
3. [runbooks/schedule-management.md](runbooks/schedule-management.md)

### 我想理解当前实现架构

先看：

1. [architecture.md](architecture.md)
2. [guides/operator-handbook.md](guides/operator-handbook.md) 中的“运行时心智模型”
3. `apps/`、`packages/` 源码

### 我想开始开发或改代码

先看：

1. [../AGENTS.md](../AGENTS.md)
2. [architecture.md](architecture.md)
3. 本页中的“系统地图”“测试分层”“设计档案”

## 系统地图

### 应用层

- `apps/gateway`
  - 负责 `websocket` 入站、命令路由、会话绑定、呈现编排、内部管理面和 `/healthz`
- `apps/executor`
  - 负责队列消费、工作区锁、Codex bridge 驱动、取消、超时和 heartbeat

### 核心包

- `packages/core`
  - 领域模型、runtime config、持久化仓储、queue / lock / heartbeat 协调与 runtime factory
- `packages/channel-feishu`
  - Feishu webhook / websocket ingress、sender、allowlist / mention 过滤、setup / doctor
- `packages/bridge-codex`
  - `codex exec` / `codex exec resume` bridge 和测试 transport
- `packages/carvis-cli`
  - operator-facing `carvis onboard/start/stop/status/doctor/configure`
- `packages/carvis-schedule-cli`
  - agent 调用的 schedule 管理 CLI

### 测试层

- `tests/unit`
  - 纯模块逻辑和细粒度行为
- `tests/contract`
  - 命令、adapter、bridge、CLI 和内部接口的稳定契约
- `tests/integration`
  - run-flow、会话命令、schedule 管理和 runtime 生命周期闭环

## 核心概念

### Workspace

`carvis` 以 workspace 为运行隔离单元。当前系统要求一个 workspace 只允许一个 active run，并通过显式队列与锁保证顺序语义。

### Session 与续聊绑定

同一 Feishu `chat` 会通过 `ConversationSessionBinding` 续用底层 Codex session。`/new` 会清除当前 chat 的续聊绑定，但不会打断已在运行中的 active run。

### Sandbox Mode

每个 workspace 都有默认 sandbox mode。chat 还可以通过 `/mode workspace-write` 或 `/mode danger-full-access` 写入临时 override，30 分钟后过期，`/mode reset` 可主动清理。

### Run Presentation

运行开始后，系统会记录 `RunPresentation` 并驱动 reaction、运行中卡片和终态摘要卡；若卡片链路失败，会降级为兜底终态消息。

### Schedule Management

调度管理由 agent 通过 `carvis-schedule` 进行。控制面写入、执行链路和审计查询面是分开的；专题见 [runbooks/schedule-management.md](runbooks/schedule-management.md)。

## 常用开发命令

```bash
bun install
bun run lint
bun run test:unit
bun test
bun run dev:gateway
bun run dev:executor
```

如果要走 operator CLI 路径：

```bash
bun run --filter @carvis/carvis-cli carvis onboard
bun run --filter @carvis/carvis-cli carvis status
```

## 测试分层与变更要求

根据 [../AGENTS.md](../AGENTS.md) 当前约束，以下改动不应只补 unit tests：

- adapter 边界变更
- bridge 边界变更
- run-flow 变更
- lifecycle、heartbeat、operator 可见状态变更

这类改动至少需要补：

- contract coverage
- integration coverage

排查已有回归路径时，优先查看：

- `tests/contract/status-command.contract.test.ts`
- `tests/integration/carvis-onboard-cli.test.ts`
- `tests/integration/feishu-session-memory-commands.test.ts`
- `tests/integration/feishu-sandbox-mode-commands.test.ts`
- `tests/integration/feishu-bind-command.test.ts`

## 主题文档

- [architecture.md](architecture.md)
- [guides/operator-handbook.md](guides/operator-handbook.md)
- [runbooks/local-runtime-cli.md](runbooks/local-runtime-cli.md)
- [runbooks/schedule-management.md](runbooks/schedule-management.md)

## 设计档案

`specs/` 与 `docs/plans/` 主要用于保存设计历史、方案演化和实施计划，不是首次阅读的主入口。

建议使用方式：

- 想看“当前系统如何工作”，先读 [architecture.md](architecture.md)
- 想看“这个能力为何这样设计”，再进入对应 `specs/<编号>-<主题>/`
- 想看“最近一次实现如何拆分任务”，再读 `docs/plans/`

当前与已落地能力最相关的 spec 包括：

- `specs/002-local-runtime-wiring`
- `specs/003-feishu-cardkit-results`
- `specs/004-codex-session-memory`
- `specs/007-agent-managed-scheduling`
- `specs/011-workspace-sandbox-mode`
- `specs/013-carvis-onboard-cli`
