# CLI Reference

本文记录 `carvis` 本地 runtime CLI 的稳定入口和当前可观察行为。

## 推荐调用方式

在当前仓库内，最稳定的调用方式是：

```bash
bun run --filter @carvis/carvis-cli carvis <command>
```

例如：

```bash
bun run --filter @carvis/carvis-cli carvis onboard
bun run --filter @carvis/carvis-cli carvis status
```

不要默认假设裸 `carvis` 已在你的 shell `PATH` 中。

## 支持的命令

- `onboard`
- `start`
- `stop`
- `status`
- `doctor`
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

### `onboard`

- 首次引导入口
- 收集 Feishu 和 runtime 所需配置
- 写出 `~/.carvis/config.json` 和 `~/.carvis/runtime.env`
- 成功后自动继续执行 `start`

### `start`

- 基于现有配置拉起 `gateway` 和 `executor`
- 收敛到 runtime ready 或结构化失败

### `stop`

- 停止本地 runtime
- 清理 state 文件

### `status`

- 聚合 gateway / executor 本地状态
- 在可能的情况下刷新 `/healthz`
- 适合配合 `--json` 做精确排障

### `doctor`

- 检查 runtime config、Feishu、Postgres、Redis、Codex CLI 和 `gateway /healthz`

### `configure`

- `configure feishu`
  - 重配 Feishu 凭据与相关配置
- `configure workspace`
  - 重配默认 workspace 相关配置

## 常用排障组合

```bash
bun run --filter @carvis/carvis-cli carvis status --json
bun run --filter @carvis/carvis-cli carvis doctor
```

如果还不够，再看 [reference-config.md](reference-config.md) 中的 state / log 文件。
