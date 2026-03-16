# Quickstart

## 目标

按最小可交付顺序实现 `carvis` 的 onboarding 与本地 runtime 生命周期 CLI，并保持现有双进程、队列、锁和运行语义不变。

## 实现顺序

### 1. 先补 CLI 包和基础命令解析

1. 新建 `packages/carvis-cli`
2. 实现 `onboard/start/stop/status/doctor/configure` 的命令解析骨架和 runtime flags
3. 为 parser、配置写入和本地 state store 写单元测试

验证命令：

```bash
bun test tests/unit -t "carvis cli"
```

### 2. 接入飞书 setup/doctor 合同

1. 在 `packages/channel-feishu` 新增 setup 子模块
2. 暴露字段说明、默认值、完整步骤引导和校验能力
3. 增加凭据 probe 和 contract test

验证命令：

```bash
bun test tests/contract -t "feishu setup"
bun test tests/integration -t "feishu guidance"
```

### 3. 补 runtime state sink 与优雅退出

1. 在 `packages/core` 增加可选本地 runtime state sink
2. 让 `gateway` 与 `executor` 在 CLI 场景下把状态写入本地文件
3. 为两个入口补上 `SIGINT` / `SIGTERM` 的优雅退出

验证命令：

```bash
bun test tests/unit -t "runtime state"
bun test tests/integration -t "startup"
```

### 4. 实现 `start/stop/status/doctor`

1. `start` 负责配置校验、启动编排和 ready 收敛
2. `stop` 负责按顺序停止进程并清理 stale state
3. `status` 聚合 `gateway /healthz`、`executor` 状态和本地 process state
4. `doctor` 复用真实 healthcheck 与 adapter probe

验证命令：

```bash
bun test tests/contract -t "carvis cli"
bun test tests/integration -t "carvis cli"
```

### 5. 实现 `onboard` 与 `configure`

1. `onboard` 默认以交互式 wizard 运行，并支持 `quickstart` / `manual` flow
2. `configure` 以交互式 section editor 方式实现 `feishu` 与 `workspace`，默认展示字段级短提示，不增加额外的帮助确认步骤
3. 默认输出人类可读结果，`--json` 只给自动化或脚本使用
4. 对已有配置、重复启动和 stale state 做显式处理

验证命令：

```bash
bun test tests/integration -t "onboard"
```

### 6. 更新文档与 runbook

1. 更新 `specs/002-local-runtime-wiring/quickstart.md`
2. 更新 `docs/architecture.md`
3. 更新 `AGENTS.md` 中对本地启动方式的说明

### 7. 全量回归

```bash
bun run lint
bun test
```

## 完成定义

- `carvis onboard` 能引导操作者完成首次配置，并自动尝试启动系统
- `carvis onboard` 与 `carvis configure` 在真实终端中表现为向导式交互，而不是伪交互问答
- `carvis start` / `stop` / `status` / `doctor` 构成稳定的本地运维入口
- 飞书接入指引和校验能力由 `packages/channel-feishu` 提供
- `status` 能区分“进程活着”和“系统 ready”
- 本功能不改变现有 run lifecycle、workspace lock、queue、cancel、timeout、heartbeat 语义
