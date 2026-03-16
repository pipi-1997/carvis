# Config Reference

本文记录 `carvis` 本地 runtime 常用配置、状态和日志文件。

## 文件位置

### `~/.carvis/config.json`

- 结构化 runtime 配置
- 包含：
  - `agent`
  - `gateway`
  - `executor`
  - `feishu`
  - `workspaceResolver`
  - `triggers`

### `~/.carvis/runtime.env`

- 环境相关 secrets
- 典型字段：
  - `FEISHU_APP_ID`
  - `FEISHU_APP_SECRET`
  - `POSTGRES_URL`
  - `REDIS_URL`

### `~/.carvis/state/gateway.json`

- gateway 本地状态快照
- 适合查看：
  - 最近一次健康状态
  - `lastErrorCode`
  - `lastErrorMessage`
  - `pid`
  - `logPath`

### `~/.carvis/state/executor.json`

- executor 本地状态快照
- 适合查看：
  - `startupReport`
  - `lastErrorCode`
  - `lastErrorMessage`
  - `pid`
  - `logPath`

### `~/.carvis/logs/gateway.log`

- gateway 日志

### `~/.carvis/logs/executor.log`

- executor 日志

## workspace 路径约束

首次引导或 `configure workspace` 时，默认 workspace 路径必须满足：

- 路径已经存在
- 路径是目录
- 路径位于 `managedWorkspaceRoot` 内

不满足时，`onboard` 或 `configure workspace` 会失败。

## 推荐排障视图

### 快速看整体状态

```bash
bun run --filter @carvis/carvis-cli carvis status --json
```

### 看依赖和健康检查

```bash
bun run --filter @carvis/carvis-cli carvis doctor
```

### 看进程状态与错误码

- `~/.carvis/state/gateway.json`
- `~/.carvis/state/executor.json`

### 看具体运行日志

- `~/.carvis/logs/gateway.log`
- `~/.carvis/logs/executor.log`
