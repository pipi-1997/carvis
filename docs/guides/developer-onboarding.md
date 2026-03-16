# Developer Onboarding

本文面向第一次进入 `carvis` 代码库的开发者。目标不是覆盖所有细节，而是让你在最短时间内建立正确的系统地图、边界感和阅读顺序。

## 先读什么

建议按这个顺序进入：

1. [../../README.md](../../README.md)
2. [../architecture.md](../architecture.md)
3. [../../AGENTS.md](../../AGENTS.md)
4. 再按你要改的领域进入 `apps/`、`packages/`、`tests/`

## 系统地图

### `apps/gateway`

负责：

- Feishu `websocket` 入站
- 命令路由
- 会话 / workspace 绑定
- 运行结果呈现
- `/healthz`
- schedule 内部管理面和相关内部接口

### `apps/executor`

负责：

- 队列消费
- workspace 锁
- Codex bridge 驱动
- cancel / timeout / heartbeat
- 启动期 readiness

### `packages/core`

负责：

- 领域模型
- runtime config
- 持久化仓储
- queue / lock / heartbeat / cancel 协调
- runtime factory

### `packages/channel-feishu`

负责：

- webhook / websocket ingress
- sender
- allowlist / mention 过滤
- setup / doctor

### `packages/bridge-codex`

负责：

- `codex exec` / `codex exec resume`
- bridge transport
- `codex` 和 `carvis-schedule` 的 readiness 检查

### `packages/carvis-cli`

负责 operator-facing runtime CLI：

- `carvis onboard`
- `carvis start`
- `carvis stop`
- `carvis status`
- `carvis doctor`
- `carvis configure`

### `packages/carvis-schedule-cli`

负责 agent 调用的 schedule 管理 CLI：

- `create`
- `list`
- `update`
- `disable`

## 核心边界

以下边界不要在改动时打穿：

- 保持 `ChannelAdapter` 和 `AgentBridge` 边界
- Postgres 是 durable state，Redis 只做协调
- 每个 workspace 只能有一个 active run
- operator 可见状态、日志、heartbeat 行为不能随意漂移

这些约束在 [../../AGENTS.md](../../AGENTS.md) 中是硬约束。

## 核心概念

### Workspace

运行隔离单元。当前系统以 workspace 为调度和串行化边界。

### Session 与续聊绑定

同一 Feishu `chat` 会通过 `ConversationSessionBinding` 续用底层 Codex session。`/new` 会清除当前 chat 的续聊绑定，但不打断正在执行的 run。

### Sandbox Mode

每个 workspace 有默认 sandbox mode，chat 还能通过 `/mode` 写入短期 override。

### Run Presentation

运行过程中的 reaction、运行中卡片、终态卡和兜底终态消息都通过 `RunPresentation` 驱动。

### Schedule Management

schedule 管理通过 `carvis-schedule` 走受控控制面，不直接绕过边界写持久化层。

## 测试分层

### `tests/unit`

适合：

- 纯函数逻辑
- 模块级行为
- parser / formatter / resolver

### `tests/contract`

适合：

- 命令契约
- adapter / bridge 契约
- CLI 稳定输出
- 内部接口和 HTTP surface

### `tests/integration`

适合：

- run-flow
- 生命周期
- 会话命令闭环
- runtime lifecycle
- schedule 管理端到端路径

## 改动时的最低阅读路径

### 改 gateway 命令 / 呈现 / workspace 路由

先看：

- `apps/gateway/src/commands/*`
- `apps/gateway/src/services/*`
- `tests/contract/status-command.contract.test.ts`
- `tests/integration/feishu-*.test.ts`

### 改 executor / readiness / bridge

先看：

- `apps/executor/src/*`
- `packages/bridge-codex/src/*`
- `tests/integration/executor-startup.test.ts`
- `tests/unit/bridge-codex-cli-transport.test.ts`

### 改 operator CLI

先看：

- `packages/carvis-cli/src/*`
- `tests/contract/carvis-cli-*.contract.test.ts`
- `tests/integration/carvis-*.test.ts`

### 改 schedule 管理

先看：

- `packages/carvis-schedule-cli/src/*`
- `apps/gateway/src/services/schedule-management-*`
- `docs/runbooks/schedule-management.md`

## 常用命令

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
bun run --filter @carvis/carvis-cli carvis status --json
```

## 设计档案怎么看

`specs/` 和 `docs/plans/` 都保留了很多设计历史，但不要从那里开始读整个系统。

建议：

- 看当前实现：先看 `README`、guide、architecture
- 看能力缘起：再进入对应 `specs/<编号>-<主题>/`
- 看实施拆解：再进入 `docs/plans/`
