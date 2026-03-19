# 本地托管式部署 Runbook

本文记录 `016-daemon-deployment` 当前已落地的 operator 路径。目标不是描述远期全自动安装器，而是说明当前仓库里的 `install / onboard / daemon / infra / status / doctor / uninstall` 如何协作。

## 1. 首次安装

执行：

```bash
bun run --filter @carvis/carvis-cli carvis install
```

预期：

- 在 `~/.carvis` 下创建 `versions/`、`run/`、`state/`、`logs/`、`data/`
- 写入 `install-manifest.json`
- 按平台生成 user service definition
- 输出下一步 `carvis onboard`
- 安装开始时会 probe `docker` / `docker compose`，确保宿主机具备兼容的 Docker API

## 2. 首次引导

执行：

```bash
bun run --filter @carvis/carvis-cli carvis onboard
```

预期：

- 写入 `config.json` 与 `runtime.env`
- 校验 Feishu 凭据
- 若安装层存在，优先尝试 `daemon start`
- 若安装层缺失，明确返回 `carvis install is required before onboard`

## 3. 日常运维

常用命令：

```bash
bun run --filter @carvis/carvis-cli carvis daemon status
bun run --filter @carvis/carvis-cli carvis infra status
bun run --filter @carvis/carvis-cli carvis status --json
bun run --filter @carvis/carvis-cli carvis doctor --json
```

判读方式：

- `install`: 安装层是否完整
- `infra`: Docker Compose 托管的 Postgres / Redis 快照
- `externalDependencies`: `codex` 与 Feishu 凭据
- `daemon`: socket / pid / service state
- `runtime`: `gateway` / `executor` 和 `CONFIG_DRIFT`

## 4. daemon 不可达时

如果 `daemon status` 或 `status` 显示 socket 不可达：

1. 先看 `~/.carvis/state/daemon.json`
2. 再看 `~/.carvis/state/layered-status.json`
3. 然后执行：

```bash
bun run --filter @carvis/carvis-cli carvis daemon restart
bun run --filter @carvis/carvis-cli carvis doctor
```

## 5. 修复与卸载

修复：

```bash
bun run --filter @carvis/carvis-cli carvis install --repair
```

默认卸载：

```bash
bun run --filter @carvis/carvis-cli carvis uninstall
```

显式清空：

```bash
bun run --filter @carvis/carvis-cli carvis uninstall --purge
```

注意：

- 默认卸载只移除 active bundle 与 service definition
- `--purge` 才会删除 `data/` 和 `state/`
