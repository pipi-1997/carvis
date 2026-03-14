# carvis 开发指南

根据所有 feature plan 自动生成。最后更新时间：2026-03-09

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
- `003-feishu-cardkit-results`: 新增 Feishu CardKit 单消息运行中卡片与终态富文本增强设计与 planning 产物
- `004-codex-session-memory`: 新增同一飞书 `chat` 续用 Codex 原生 session、`/new` 重置与单次自动恢复设计与 planning 产物

<!-- MANUAL ADDITIONS START -->
- 当前实现已落地本地单机双进程 runtime wiring：`gateway` 暴露 `/healthz` 并接入 Feishu `websocket`，`executor` 接入真实启动期 readiness 与消费循环。
- `packages/channel-feishu` 现在同时包含 webhook 归一化、runtime sender、websocket ingress、allowlist / mention 过滤。
- `packages/bridge-codex` 现在同时包含测试用脚本化 transport 和默认的 `codex exec` CLI transport。
- `packages/bridge-codex` 现在支持 `codex exec` 新会话与 `codex exec resume` 续聊两种执行模式，并在终态事件中回传 `bridge_session_id` / `session_outcome`；续聊 session 无效时会标记 `session_invalid`。
- 当前普通消息在入队前会读取 `ConversationSessionBinding`，同一飞书 `chat` 会默认续用同一个 Codex 原生 session。
- 当前 runtime config 已支持 `workspaceResolver.sandboxModes`，为每个 workspace 声明 `workspace-write` / `danger-full-access` 默认 mode。
- 飞书当前支持 `/mode`、`/mode workspace-write`、`/mode danger-full-access`、`/mode reset`；override 只作用于当前 `chat`，固定 30 分钟过期。
- `/new` 当前会重置当前 `chat` 的续聊绑定并清除 sandbox override，但不会打断活动运行。
- `/status` 当前返回 workspace、active run、最近一次请求是否排队、前方队列长度、续聊状态，以及当前 sandbox mode / 来源 / override 到期或已过期状态；不返回完整队列列表。
- 本地 runtime 约定从 `~/.carvis/config.json` 读取结构化配置，并从 `POSTGRES_URL`、`REDIS_URL`、`FEISHU_APP_ID`、`FEISHU_APP_SECRET` 读取环境相关信息。
- `CONFIG_DRIFT` 通过 Redis 中共享的 runtime fingerprint 检测；出现漂移时 `gateway /healthz` 降级，`executor` 拒绝消费。
- 本机验证结果：
  - `bun run lint`
  - `bun test`
  - `codex --version`
  - 当前机器未安装 `postgres` / `redis-server`，因此真实外部依赖启动需要操作者自行准备。
- `003-feishu-cardkit-results` 当前实现状态：
  - 普通消息保持 `OK` reaction 作为开始工作信号
  - `run.started` 后创建运行中 `interactive` 卡片
  - `agent.output.delta` 驱动输出窗口更新
  - 已送达卡片在终态切换为同一条完成态摘要卡，不额外发送第二条成功消息
  - 只有在卡片从未成功创建时才退化为单条终态富文本兜底消息
- `004-codex-session-memory` 当前实现状态：
  - 同一飞书 `chat` 的后续普通消息默认续用当前 `ConversationSessionBinding`
  - 首轮成功后会为该 `chat` 建立或刷新底层 Codex session 绑定
  - continuation binding 会记录建立该 session 时的 sandbox mode；mode 改变后的下一条普通消息会强制 fresh
  - `/new` 会清空当前 `chat` 的续聊绑定和 sandbox override，后续普通消息从新会话和 workspace 默认 mode 开始
  - 若底层续聊 session 无效，`executor` 会在同一 run 内自动 fresh 重试一次
  - `/bind` 切 workspace 时也会清理 sandbox override，避免跨 workspace 沿用旧权限
  - `/status` 会暴露 `fresh` / `continued` / `recent_reset` / `recent_recovered` / `recent_recovery_failed`，以及当前 sandbox mode / 来源 / override 状态
<!-- MANUAL ADDITIONS END -->
