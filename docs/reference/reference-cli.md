# CLI Reference

本文记录 `carvis` 本地 runtime CLI 的稳定入口和当前可观察行为。

## 推荐调用方式

在当前仓库内，最稳定的调用方式是：

```bash
bun run --filter @carvis/carvis-cli carvis <command>
```

例如：

```bash
bun run --filter @carvis/carvis-cli carvis install
bun run --filter @carvis/carvis-cli carvis onboard
bun run --filter @carvis/carvis-cli carvis daemon status
bun run --filter @carvis/carvis-cli carvis status
```

不要默认假设裸 `carvis` 已在你的 shell `PATH` 中。

## 支持的命令

- `onboard`
- `install`
- `daemon status|start|stop|restart`
- `infra status|start|stop|restart|rebuild`
- `start`
- `stop`
- `status`
- `doctor`
- `uninstall`
- `configure feishu`
- `configure workspace`

## 输出模式

### 默认行为

- TTY 下默认输出人类可读文本
- 非 TTY 下默认输出 JSON

### 显式 JSON

```bash
bun run --filter @carvis/carvis-cli carvis status --json
```

适合：

- 脚本调用
- 精确查看嵌套字段
- 排障时读取 `gateway.healthSnapshot.ready`、`executor.startupReport.status` 等字段

## TTY 约束

`onboard` 与 `configure` 当前都要求交互式 TTY。

如果不是交互式终端：

- CLI 会直接失败
- 当前没有对外暴露一组完整的非交互 onboarding / configure 参数来替代交互流程

## 命令语义

### `install`

- 安装托管式本地部署布局
- 写入版本化 bundle manifest、Docker Compose 资产、service definition、run/state/log/data 目录；启动前会 probe `docker` 与 `docker compose`
- 成功后提示继续执行 `onboard`

### `onboard`

- 首次引导入口
- 收集 Feishu 和 runtime 所需配置
- 写出 `~/.carvis/config.json` 和 `~/.carvis/runtime.env`
- 若安装层已存在，则优先通过 daemon 收敛 runtime；测试注入场景下仍兼容直接 process manager
- onboarding 现在不再提示 `POSTGRES_URL` / `REDIS_URL`；这些由 Docker Compose 启动后自动写入

### `daemon`

- `daemon start|stop|restart|status`
- 这是新的 runtime 托管主入口
- 通过本地 Unix socket 与后台 supervisor 协作

### `infra`

- 负责展示和控制 Docker Compose 托管的 Postgres / Redis 层状态
- daemon 不可达时会回退到持久化快照

### `start`

- 兼容入口
- 主语义映射到 `carvis daemon start`

### `stop`

- 兼容入口
- 主语义映射到 `carvis daemon stop`

### `status`

- 返回 install / infra / external dependency / daemon / runtime 五层聚合状态
- 同时保留 `gateway` / `executor` 顶层别名，兼容现有脚本和测试

### `doctor`

- 检查 runtime config、Feishu、Docker-managed Postgres/Redis、Codex CLI 和 `gateway /healthz`
- 每个检查项带 layer 与推荐动作

### `uninstall`

- 默认移除 active bundle 和 service definition
- `--purge` 额外清理 data / state

### `configure`

- `configure feishu`
  - 重配 Feishu 凭据与相关配置
- `configure workspace`
  - 重配默认 workspace 相关配置

## 常用排障组合

```bash
bun run --filter @carvis/carvis-cli carvis install --json
bun run --filter @carvis/carvis-cli carvis daemon status --json
bun run --filter @carvis/carvis-cli carvis status --json
bun run --filter @carvis/carvis-cli carvis doctor
```

如果还不够，再看 [reference-config.md](reference-config.md) 中的 state / log 文件。
