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
- Feishu webhook
- Codex CLI

## 项目结构

```text
apps/
packages/
tests/
```

## 常用命令

- `bun test`
- `bun run lint`
- `bun run dev:gateway`
- `bun run dev:executor`

## 代码风格

- 优先保持 `apps/gateway`、`apps/executor`、`packages/*` 的边界清晰
- 中文文档优先，路径、命令、代码标识和结构化 ID 保持原文
- 涉及运行生命周期的变更必须同步更新契约测试和集成测试

## 最近变更

- `001-feishu-codex-mvp`: 新增 Feishu + Codex 对话闭环设计与计划产物

<!-- MANUAL ADDITIONS START -->
- 当前实现已落地 `packages/core` 的内存仓储与 runtime 原语、`packages/channel-feishu` 验签与归一化、`packages/bridge-codex` 脚本化 bridge，以及 `apps/gateway` / `apps/executor` 的最小闭环。
- `/status` 当前返回固定 workspace、active run、最近一次请求是否排队以及前方队列长度；不返回完整队列列表。
<!-- MANUAL ADDITIONS END -->
