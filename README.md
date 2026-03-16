# carvis

`carvis` 是一个面向本地运行时的 Feishu + Codex agent 系统。当前实现聚焦单机双进程 runtime、固定 workspace 执行、同 chat 续聊、sandbox mode 控制，以及基于 `carvis-schedule` 的调度管理。

## 当前范围

- Feishu `websocket` 入站与消息发送
- `Codex CLI` 新会话与续聊执行
- `gateway` + `executor` 双进程本地 runtime
- 单 workspace 单活动运行与显式队列 / 锁语义
- `/bind`、`/status`、`/mode`、`/new`、`/abort` 命令
- 运行中卡片、终态摘要卡与异常兜底消息
- operator-facing `carvis onboard/start/stop/status/doctor/configure`

不在当前范围内：

- 多渠道适配器
- 云端托管部署说明
- 远期 roadmap 或未落地 spec 的完整实现说明

## 快速开始

### 1. 准备依赖

在本机先确认以下条件：

- `bun --version`
- `codex --version`
- 可访问的 PostgreSQL
- 可访问的 Redis
- 已配置好 Feishu 应用并启用 `websocket` 长连接事件订阅

### 2. 安装依赖

```bash
bun install
```

### 3. 首次引导

在仓库根目录执行：

```bash
bun run --filter @carvis/carvis-cli carvis onboard
```

该命令会：

- 收集 Feishu 与 runtime 所需配置
- 写出 `~/.carvis/config.json` 与 `~/.carvis/runtime.env`
- 自动继续执行 `carvis start`

### 4. 日常运维

```bash
bun run --filter @carvis/carvis-cli carvis status
bun run --filter @carvis/carvis-cli carvis doctor
bun run --filter @carvis/carvis-cli carvis stop
bun run --filter @carvis/carvis-cli carvis start
```

更详细的 operator 路径见 [docs/guides/operator-handbook.md](docs/guides/operator-handbook.md)。

## Feishu 会话命令

- `/help` 查看帮助
- `/bind <workspace-key>` 绑定或切换当前 chat 的 workspace
- `/status` 查看当前会话状态、队列位置和 sandbox 信息
- `/mode` 查看当前会话 sandbox mode
- `/mode workspace-write` / `/mode danger-full-access` 设置 30 分钟 override
- `/mode reset` 清除当前会话 override
- `/new` 重置当前 chat 的续聊绑定并清除 override
- `/abort` 取消当前活动运行

## 核心能力与边界

### 运行时边界

- 保持 `ChannelAdapter` 与 `AgentBridge` 边界清晰
- Postgres 负责 durable state，Redis 只负责协调
- 每个 workspace 同时只允许一个 active run
- lifecycle、heartbeat、日志与 operator 可见状态是稳定约束

### 当前实现要点

- 普通消息会按 chat 读取 `ConversationSessionBinding`，默认续用底层 Codex session
- 当续聊 session 失效时，`executor` 会在同一 run 内自动 fresh 重试一次
- sandbox mode 支持 workspace 默认值和 chat 级临时 override
- schedule 管理必须通过 `carvis-schedule` 完成，而不是直接写持久化层

更完整的实现说明见 [docs/architecture.md](docs/architecture.md)。

## 仓库结构

```text
apps/
  gateway/     Feishu ingress、命令路由、呈现编排、内部管理面
  executor/    队列消费、工作区锁、Codex bridge 驱动、heartbeat
packages/
  core/                领域模型、配置、持久化、runtime 组装
  channel-feishu/      渠道适配、sender、websocket ingress、setup/doctor
  bridge-codex/        Codex CLI bridge 与测试 transport
  carvis-cli/          operator-facing runtime CLI
  carvis-schedule-cli/ schedule 管理 CLI
tests/
  contract/ integration/ unit/
docs/
  architecture.md
  guides/
  runbooks/
  plans/
specs/
```

## 常用命令

### 开发

```bash
bun run dev:gateway
bun run dev:executor
```

### 测试与检查

```bash
bun run lint
bun run test:unit
bun test
```

### 本地 runtime CLI

```bash
bun run --filter @carvis/carvis-cli carvis onboard
bun run --filter @carvis/carvis-cli carvis start
bun run --filter @carvis/carvis-cli carvis stop
bun run --filter @carvis/carvis-cli carvis status
bun run --filter @carvis/carvis-cli carvis doctor
```

## 文档导航

- [docs/guides/operator-handbook.md](docs/guides/operator-handbook.md)：operator 主手册，覆盖安装、启动、状态检查、重配和排障
- [docs/index.md](docs/index.md)：docs 总入口，适合新开发者按主题进入
- [docs/architecture.md](docs/architecture.md)：当前实现架构、拓扑和请求执行流
- [docs/runbooks/schedule-management.md](docs/runbooks/schedule-management.md)：schedule 管理专题 runbook
- [AGENTS.md](AGENTS.md)：仓库开发约束、测试要求和近期实现说明

## 开发说明

本仓库以中文文档为主。涉及运行生命周期、adapter、bridge 或 run-flow 的变更时，需同步补齐 contract 和 integration coverage，相关约束见 [AGENTS.md](AGENTS.md)。
