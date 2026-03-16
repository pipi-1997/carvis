# 快速验证：本地 Runtime CLI

## 1. 准备外部依赖

- 启动本地 Postgres
- 启动本地 Redis
- 确认 `codex --version` 可执行
- 确认飞书应用已按 `websocket` 长连接方式启用事件订阅

## 2. 首次引导

在仓库根目录执行：

```bash
bun run --filter @carvis/carvis-cli carvis onboard
```

预期行为：

- CLI 引导输入 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`allowFrom`、`requireMention`
- CLI 引导输入 `POSTGRES_URL`、`REDIS_URL` 和默认 workspace 路径
- 写出 `~/.carvis/config.json` 与 `~/.carvis/runtime.env`
- 自动继续执行 `carvis start`

## 3. 日常运维

启动、停机、查看状态和体检统一走：

```bash
bun run --filter @carvis/carvis-cli carvis start
bun run --filter @carvis/carvis-cli carvis status
bun run --filter @carvis/carvis-cli carvis doctor
bun run --filter @carvis/carvis-cli carvis stop
```

增量重配走：

```bash
bun run --filter @carvis/carvis-cli carvis configure feishu
bun run --filter @carvis/carvis-cli carvis configure workspace
```

## 4. 就绪判定

`carvis start` 和 `carvis onboard` 的成功标准是：

- `gateway /healthz.ready = true`
- `executor` 最近一次 startup report `status = ready`

`carvis status` 会区分：

- 进程未运行
- 进程运行中但 runtime 未 ready
- runtime ready

## 5. 本地文件

CLI 管理以下本地文件：

- `~/.carvis/config.json`
- `~/.carvis/runtime.env`
- `~/.carvis/state/gateway.json`
- `~/.carvis/state/executor.json`
- `~/.carvis/logs/gateway.log`
- `~/.carvis/logs/executor.log`

## 6. 故障验证

建议至少验证以下场景：

- `carvis doctor` 报告 `CODEX_UNAVAILABLE`
- 飞书凭据错误时 `carvis onboard` / `carvis configure feishu` 在启动前失败
- `gateway /healthz` 出现 `FEISHU_WS_DISCONNECTED`
- `CONFIG_DRIFT` 出现时 `gateway` 降级、`executor` 拒绝消费
- stale pid/state 存在时 `carvis start` 自动清理后继续

## 7. 自动化验证

自动化验证已覆盖：

- `bun run lint`
- `bun test`
- `carvis onboard -> start`
- `carvis start/status/stop`
- `carvis configure feishu|workspace`
