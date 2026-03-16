# Operator 主手册

本文面向本地 operator。它不追求覆盖所有实现细节，只覆盖三件事：如何跑起来、如何日常运维、如何定位故障。

## Before You Begin

### 前置依赖

首次引导前确认本机具备：

- `bun --version`
- `codex --version`
- 可访问的 PostgreSQL
- 可访问的 Redis
- 已创建并配置好的 Feishu 应用
  - 启用 `websocket` 长连接事件订阅
  - 已准备 `FEISHU_APP_ID` 与 `FEISHU_APP_SECRET`

### 运行时心智模型

当前 `carvis` 是本地双进程 runtime：

- `gateway`
  - Feishu `websocket` 入站、命令路由、消息呈现、`/healthz`
- `executor`
  - 队列消费、workspace 锁、Codex 执行、cancel / timeout / heartbeat

关键约束：

- 每个 workspace 同时只有一个 active run
- Postgres 存 durable state，Redis 只做协调
- operator 可以通过 CLI、state 文件、日志和健康检查观察当前状态

如果你需要拓扑和时序图，看 [../architecture.md](../architecture.md)。

## First-Time Setup

### 1. 安装仓库依赖

```bash
bun install
```

### 2. 执行首次引导

```bash
bun run --filter @carvis/carvis-cli carvis onboard
```

`onboard` 会交互式收集：

- Feishu App ID / App Secret
- `allowFrom`
- 是否要求 mention
- `POSTGRES_URL`
- `REDIS_URL`
- 默认 workspace 路径

成功后会：

1. 写出 `~/.carvis/config.json`
2. 写出 `~/.carvis/runtime.env`
3. 自动继续执行 `carvis start`

### 3. workspace 路径约束

默认 workspace 路径必须满足：

- 路径已经存在
- 路径是目录
- 路径位于 `managedWorkspaceRoot` 内

如果不满足，`onboard` 或后续 `configure workspace` 会直接失败。

### 4. TTY 约束

`onboard` 和 `configure` 当前都要求交互式 TTY。

- 如果不是交互式终端，CLI 会直接失败
- 当前没有对外暴露完整的非交互 onboarding / configure 参数

## Daily Operations

### 查看状态

```bash
bun run --filter @carvis/carvis-cli carvis status
```

默认人类可读输出只会总结：

- `overall`
- `gateway`
- `executor`

如果你需要排障字段，优先使用：

```bash
bun run --filter @carvis/carvis-cli carvis status --json
```

重点看：

- `overallStatus`
- `gateway.healthSnapshot.ready`
- `gateway.lastErrorCode`
- `executor.startupReport.status`
- `executor.lastErrorCode`

### 体检

```bash
bun run --filter @carvis/carvis-cli carvis doctor
```

会检查：

- runtime config 是否可加载
- Feishu 凭据是否有效
- PostgreSQL 是否可达
- Redis 是否可达
- `codex` CLI 是否可用
- `gateway /healthz` 是否 ready

### 启动

```bash
bun run --filter @carvis/carvis-cli carvis start
```

适用场景：

- 现有配置已正确，只需把 runtime 拉起来
- stale state 需要清理后重启

### 停止

```bash
bun run --filter @carvis/carvis-cli carvis stop
```

适用场景：

- 正常停机
- 故障后强制收口本地 runtime

如果部分进程已退出，结果可能是 `partial`，CLI 仍会继续清理 state。

## Reconfigure

### 复用 / 修改已有配置

如果 `~/.carvis/config.json` 已存在，`onboard` 会提供：

- `reuse`
  - 复用现有配置并直接进入 `start`
- `modify`
  - 修改现有配置后再进入 `start`
- `cancel`
  - 取消操作，不改配置也不启动

### 局部重配

```bash
bun run --filter @carvis/carvis-cli carvis configure feishu
bun run --filter @carvis/carvis-cli carvis configure workspace
```

适用场景：

- 只换 Feishu 凭据
- 只调整 workspace 相关配置

## Feishu-Side Commands

Feishu 会话侧高频命令：

- `/bind <workspace-key>`
- `/status`
- `/mode`
- `/mode workspace-write`
- `/mode danger-full-access`
- `/mode reset`
- `/new`
- `/abort`

完整说明见 [../reference/reference-chat-commands.md](../reference/reference-chat-commands.md)。

## Readiness And Where To Look

### 真正 ready 的标准

只有同时满足以下条件才算 ready：

- `gateway /healthz.ready = true`
- `executor` 最近一次 startup report `status = ready`

### 常用本地文件

- `~/.carvis/config.json`
- `~/.carvis/runtime.env`
- `~/.carvis/state/gateway.json`
- `~/.carvis/state/executor.json`
- `~/.carvis/logs/gateway.log`
- `~/.carvis/logs/executor.log`

详细说明见 [../reference/reference-config.md](../reference/reference-config.md)。

## Troubleshooting Matrix

| 症状                     | 优先判断                              | 建议动作                                                                   |
| ------------------------ | ------------------------------------- | -------------------------------------------------------------------------- |
| `status` 显示 stopped    | 进程未运行                            | 执行 `carvis start`                                                        |
| 进程活着但系统没 ready   | 看 `status --json` 和 `doctor`        | 优先查看 `gateway.healthSnapshot.ready` 和 `executor.startupReport.status` |
| `CONFIG_DRIFT`           | 两侧 runtime fingerprint 不一致       | 确认 `config.json` / `runtime.env` 一致后重启                              |
| `CODEX_UNAVAILABLE`      | `codex` 或 `carvis-schedule` 探针失败 | 先跑 `carvis doctor`，再做手工验证                                         |
| `FEISHU_WS_DISCONNECTED` | Feishu ingress 未 ready               | 看 `gateway.log` 和 Feishu 应用配置                                        |
| `INVALID_CREDENTIALS`    | Feishu 凭据错误                       | 执行 `carvis configure feishu`                                             |

## 推荐排障顺序

大多数问题按这个顺序处理：

1. `bun run --filter @carvis/carvis-cli carvis status --json`
2. `bun run --filter @carvis/carvis-cli carvis doctor`
3. 查看 `~/.carvis/state/gateway.json`
4. 查看 `~/.carvis/state/executor.json`
5. 查看 `~/.carvis/logs/gateway.log`
6. 查看 `~/.carvis/logs/executor.log`
7. 必要时执行 `carvis stop` 后再 `carvis start`

## When To Jump Elsewhere

### 跳到 schedule 专题

以下情况直接转到 [../runbooks/schedule-management.md](../runbooks/schedule-management.md)：

- agent 调用了 `carvis-schedule` 但返回异常
- 调度创建成功但后续执行失败
- `unsupported_schedule`
- `ambiguous_target`
- 需要查看 `/internal/managed-schedules`

### 跳到 reference

- 查 CLI 稳定语义：看 [../reference/reference-cli.md](../reference/reference-cli.md)
- 查会话命令：看 [../reference/reference-chat-commands.md](../reference/reference-chat-commands.md)
- 查本地配置和文件：看 [../reference/reference-config.md](../reference/reference-config.md)
