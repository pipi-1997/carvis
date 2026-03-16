# Operator 主手册

本文面向本地 operator，目标是用最少跳转完成首次安装、日常运维和故障排查。专题化的 schedule 管理问题请转到 [../runbooks/schedule-management.md](../runbooks/schedule-management.md)。

## 1. 运行时心智模型

当前 `carvis` 是一个本地双进程 runtime：

- `gateway`
  - 负责 Feishu `websocket` 入站、命令路由、消息呈现与 `/healthz`
- `executor`
  - 负责消费队列、持有 workspace 锁、驱动 `Codex CLI` 执行

关键约束：

- 每个 workspace 同时只有一个 active run
- Postgres 存 durable state，Redis 只做协调
- operator 能通过 CLI、state 文件、日志和健康检查看到当前运行状态

如果你需要完整拓扑与时序图，见 [../architecture.md](../architecture.md)。

## 2. 前置依赖

首次引导前确认本机具备：

- `bun --version`
- `codex --version`
- 可访问的 PostgreSQL
- 可访问的 Redis
- 已创建并配置好的 Feishu 应用
  - 启用 `websocket` 长连接事件订阅
  - 准备好 `FEISHU_APP_ID` 与 `FEISHU_APP_SECRET`

建议先在仓库根目录执行：

```bash
bun install
```

## 3. 首次安装：`carvis onboard`

在仓库根目录执行：

```bash
bun run --filter @carvis/carvis-cli carvis onboard
```

`onboard` 会交互式收集以下信息：

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

如果当前不是交互式终端，`onboard` 不会假装成功，而是直接返回失败并要求在 TTY 中运行。当前 CLI 没有对外暴露一组完整的非交互 onboarding 参数来替代这一步。

## 4. 已有配置时会发生什么

如果 `~/.carvis/config.json` 已存在，`onboard` 会让你选择：

- `reuse`
  - 复用现有配置并直接进入 `start`
- `modify`
  - 修改现有配置后再进入 `start`
- `cancel`
  - 取消本次操作，不改配置也不启动

推荐使用规则：

- 只想把 runtime 拉起来：选 `reuse`
- Feishu 凭据、workspace 路径或数据库地址变了：选 `modify`
- 不确定当前环境是否正确：选 `cancel`，先执行 `status` 或 `doctor`

## 5. 日常命令

### 启动

```bash
bun run --filter @carvis/carvis-cli carvis start
```

用途：

- 基于现有 `~/.carvis/config.json` 和 `~/.carvis/runtime.env` 拉起 `gateway` 与 `executor`
- 收敛到 ready 状态
- 遇到 stale state 时先清理再继续

### 停止

```bash
bun run --filter @carvis/carvis-cli carvis stop
```

用途：

- 停止本地 runtime
- 清理 state 文件

如果部分进程已经退出，结果可能是 `partial`，但 CLI 仍会继续做清理。

### 查看状态

```bash
bun run --filter @carvis/carvis-cli carvis status
```

重点关注：

- `overallStatus`
- `gateway.status`
- `gateway.healthSnapshot.ready`
- `executor.status`
- `executor.startupReport.status`
- `lastErrorCode` / `lastErrorMessage`

### 体检

```bash
bun run --filter @carvis/carvis-cli carvis doctor
```

会覆盖以下检查：

- runtime config 是否可加载
- Feishu 凭据是否有效
- PostgreSQL 是否可达
- Redis 是否可达
- `codex` CLI 是否可用
- `gateway /healthz` 是否 ready

### 局部重配

```bash
bun run --filter @carvis/carvis-cli carvis configure feishu
bun run --filter @carvis/carvis-cli carvis configure workspace
```

适用场景：

- 只换 Feishu 凭据
- 只调整 workspace 路径或 workspace 相关设置

## 6. 本地文件布局

`carvis` 默认使用以下文件：

- `~/.carvis/config.json`
  - 结构化 runtime 配置
- `~/.carvis/runtime.env`
  - 环境相关 secrets
- `~/.carvis/state/gateway.json`
  - gateway 本地状态快照
- `~/.carvis/state/executor.json`
  - executor 本地状态快照
- `~/.carvis/logs/gateway.log`
  - gateway 日志
- `~/.carvis/logs/executor.log`
  - executor 日志

## 7. Ready 判定

只有同时满足以下条件才算真正 ready：

- `gateway /healthz.ready = true`
- `executor` 最近一次 startup report `status = ready`

因此：

- 进程活着，不等于系统 ready
- `status` 和 `doctor` 应该一起看
- 遇到降级状态时，优先看 `lastErrorCode`

## 8. Feishu 会话侧常用命令

operator 在飞书里最常用的命令有：

- `/help`
- `/bind <workspace-key>`
- `/status`
- `/mode`
- `/mode workspace-write`
- `/mode danger-full-access`
- `/mode reset`
- `/new`
- `/abort`

补充说明：

- 群聊未绑定 workspace 时，普通消息不会执行，应先 `/bind <workspace-key>`
- `/new` 只重置当前 chat 的续聊绑定，不打断活动运行
- `/mode` 的 chat override 固定 30 分钟过期

## 9. 推荐排障顺序

大多数问题建议按这个顺序处理：

1. `bun run --filter @carvis/carvis-cli carvis status`
2. `bun run --filter @carvis/carvis-cli carvis doctor`
3. 查看 `~/.carvis/logs/gateway.log`
4. 查看 `~/.carvis/logs/executor.log`
5. 必要时执行 `carvis stop` 后再 `carvis start`

如果问题只发生在 schedule 管理链路，再转到 [../runbooks/schedule-management.md](../runbooks/schedule-management.md)。

## 10. 常见失败码

### `CONFIG_DRIFT`

含义：

- gateway 与 executor 看到的 runtime fingerprint 不一致

处理：

1. 确认两侧读取的是同一份 `~/.carvis/config.json`
2. 确认两侧读取的是同一份 `~/.carvis/runtime.env`
3. 重启 runtime

### `CODEX_UNAVAILABLE`

含义：

- `codex` 或 `carvis-schedule` 不可执行

处理：

1. 执行 `codex --version`
2. 优先执行 `bun run --filter @carvis/carvis-cli carvis doctor`
3. 如需手工验证 schedule CLI，可在仓库根目录执行 `./packages/carvis-schedule-cli/bin/carvis-schedule --help`
4. 若第 3 步失败，再检查本机 Bun 运行环境与仓库依赖是否完整

### `FEISHU_WS_DISCONNECTED`

含义：

- Feishu `websocket` 未 ready 或已断开

处理：

1. 运行 `carvis doctor`
2. 查看 `gateway.log`
3. 确认 Feishu 应用事件订阅配置

### `INVALID_CREDENTIALS`

含义：

- Feishu App ID / App Secret 不正确

处理：

1. 执行 `carvis configure feishu`
2. 重新探测凭据

## 11. 何时查看 schedule 专题

以下问题不要继续在主手册里盲查，直接跳到 [../runbooks/schedule-management.md](../runbooks/schedule-management.md)：

- agent 调用了 `carvis-schedule` 但返回异常
- 调度创建成功但后续执行失败
- `unsupported_schedule`
- `ambiguous_target`
- 需要查看 `/internal/managed-schedules`

## 12. 进一步阅读

- [../architecture.md](../architecture.md)
- [../runbooks/local-runtime-cli.md](../runbooks/local-runtime-cli.md)
- [../runbooks/schedule-management.md](../runbooks/schedule-management.md)
- [../../AGENTS.md](../../AGENTS.md)
