# carvis 开发指南

根据所有 feature plan 自动生成。最后更新时间：2026-03-08

## 宪法约束

- Preserve `ChannelAdapter` and `AgentBridge` boundaries
- Treat Postgres as durable state and Redis as coordination only
- Keep one active run per workspace with explicit queue/lock semantics
- Preserve operator-visible lifecycle state, logging, and heartbeat behavior
- Require contract plus integration coverage for adapter, bridge, and run-flow changes

## 当前技术栈

- Bun 1.x + TypeScript 5.x
- Hono
- PostgreSQL
- Redis
- Feishu websocket
- Codex CLI

## 项目结构

```text
apps/
packages/
tests/
```

## 常用命令

- `bun test`
- `bun run test:unit`
- `bun run lint`
- `bun run dev:gateway`
- `bun run dev:executor`
- `bun run start:gateway`
- `bun run start:executor`

## 代码风格

- 优先保持 `apps/gateway`、`apps/executor`、`packages/*` 的边界清晰
- 中文文档优先，路径、命令、代码标识和结构化 ID 保持原文
- 涉及运行生命周期的变更必须同步更新契约测试和集成测试

## 最近变更

- `001-feishu-codex-mvp`: 新增 Feishu + Codex 对话闭环设计与计划产物
- `002-local-runtime-wiring`: 新增本地单机双进程 runtime wiring 设计与 planning 产物

<!-- MANUAL ADDITIONS START -->
- 当前实现已落地本地单机双进程 runtime wiring：`gateway` 暴露 `/healthz` 并接入 Feishu `websocket`，`executor` 接入真实启动期 readiness 与消费循环。
- `packages/channel-feishu` 现在同时包含 webhook 归一化、runtime sender、websocket ingress、allowlist / mention 过滤。
- `packages/bridge-codex` 现在同时包含测试用脚本化 transport 和默认的 `codex exec` CLI transport。
- `/status` 当前返回固定 workspace、active run、最近一次请求是否排队以及前方队列长度；不返回完整队列列表。
- 本地 runtime 约定从 `~/.carvis/config.json` 读取结构化配置，并从 `POSTGRES_URL`、`REDIS_URL`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET` 读取环境相关信息。
- `CONFIG_DRIFT` 通过 Redis 中共享的 runtime fingerprint 检测；出现漂移时 `gateway /healthz` 降级，`executor` 拒绝消费。
- 本机验证结果：
  - `bun run lint`
  - `bun test`
  - `codex --version`
  - 当前机器未安装 `postgres` / `redis-server`，因此真实外部依赖启动需要操作者自行准备。
<!-- MANUAL ADDITIONS END -->
