# Carvis Onboard CLI Design

## Goal

为 `carvis` 增加一个面向操作者的一键配置与启动 CLI，让首次使用者可以通过引导式流程完成飞书接入配置、运行时依赖配置，并直接把本地双进程 runtime 拉起到可用状态。

## Context

当前项目已经具备稳定的本地双进程运行时：

- `apps/gateway` 负责 Feishu websocket 入站、`/healthz`、命令路由、呈现编排、scheduler 与 heartbeat reaper
- `apps/executor` 负责消费、workspace lock、Codex bridge、取消、timeout 与 heartbeat
- `packages/core` 负责 runtime config、migration、queue/lock/cancel/heartbeat 与 storage
- `packages/channel-feishu` 负责 Feishu ingress、outbound sender 与 adapter 边界
- `packages/bridge-codex` 负责 Codex CLI transport 与 readiness probe

但当前操作者体验仍然偏“工程师手动接线”：

- 需要手工维护 `~/.carvis/config.json` 和 `~/.carvis/runtime.env`
- 需要手工准备 Feishu `app_id` / `app_secret`、`POSTGRES_URL`、`REDIS_URL`
- 需要手工分别启动 `gateway` 和 `executor`
- 文档中的部分 quickstart 已经与当前配置模型发生漂移

这导致系统虽然能跑，但上手门槛和排障成本偏高。

## Problem Statement

需要提供一个 operator-facing CLI，使下面三件事成为标准路径：

1. 通过引导式问题完成最小必填配置
2. 通过单条命令启动或停止整个本地 runtime
3. 通过稳定的状态与诊断输出区分“进程存活”和“系统 ready”

## Design Principles

- 保持 `ChannelAdapter` 与 `AgentBridge` 边界，不把业务逻辑塞进 CLI
- 保持 Postgres 为 durable state、Redis 为 coordination only
- 保持现有双进程 runtime 拓扑，不把 `gateway + executor` 合并成一个新的宿主进程
- 保持 operator-visible lifecycle、heartbeat、`CONFIG_DRIFT` 与 workspace lock 语义
- 中文文档优先，路径、命令、代码标识保持原文
- 初次上手优先“跑起来”，高级配置放到 `configure`

## Non-Goals

- 本轮不引入新的 Web UI onboarding
- 本轮不把 `carvis-schedule` 合并进总入口 CLI
- 本轮不把所有 adapter 的配置都做完；先围绕当前已实现的 `feishu` 路径
- 本轮不改变 Feishu websocket、Codex CLI、Postgres、Redis 的基础运行拓扑
- 本轮不引入容器编排作为主路径

## Chosen Approach

采用 `OpenClaw onboard` 风格的主入口，但结合当前仓库边界做收敛：

- 首次入口：`carvis onboard`
- 日常运维：`carvis start`、`carvis stop`、`carvis status`、`carvis doctor`
- 增量配置：`carvis configure`

`onboard` 只负责采集配置、校验、落盘，并在最后自动调用 `start`。真正的启动编排由 `start` 承担，避免把整个系统做成一个巨型交互命令。

## Command Model

### `carvis onboard`

用于首次引导，默认走最小可运行路径。

交互顺序：

1. 做本地探测，不提问
   - 检查 `codex --version`
   - 检查 `carvis-schedule --help`
   - 检查当前是否存在 `~/.carvis/config.json`
   - 检查是否已有 `gateway/executor` 在运行
2. 选择 adapter
   - 当前只提供 `feishu`
   - 交互上仍保留 adapter 选择位，为未来增加其他 adapter 预留结构
3. 采集 Feishu 必填项
   - `FEISHU_APP_ID`
   - `FEISHU_APP_SECRET`
   - `allowFrom`，默认 `["*"]`
   - `requireMention`，默认 `false`
4. 采集 runtime 依赖
   - `POSTGRES_URL`
   - `REDIS_URL`
5. 采集 workspace
   - 默认 workspace 路径，默认取当前 shell `cwd`
   - `workspaceKey` 默认 `main`
   - `managedWorkspaceRoot` 默认取默认 workspace 所在目录
   - `templatePath` 默认 `~/.carvis/templates/default-workspace`
6. 写配置
   - `~/.carvis/config.json`
   - `~/.carvis/runtime.env`
7. 调用 `carvis start`

### `carvis start`

负责整个本地 runtime 的启动编排。

职责：

1. 读取 `~/.carvis/config.json` 与 `~/.carvis/runtime.env`
2. 执行依赖检查与预校验
3. 启动 `gateway`
4. 等待 `gateway /healthz` 达到稳定状态
5. 启动 `executor`
6. 等待 executor 输出明确的 startup report
7. 写入本地 state 与日志路径
8. 输出最终 ready/degraded/failed 结论

### `carvis stop`

负责安全停止本地 runtime。

职责：

1. 读取本地 state
2. 按顺序停止 `executor`、`gateway`
3. 等待进程退出
4. 清理 pid/state 中的活动状态

### `carvis status`

提供本地 runtime 的当前观测结果。

输出应包含：

- `gateway` 进程是否存活
- `gateway /healthz` 的实时快照
- `executor` 进程是否存活
- `executor` 最近一次 startup report
- 当前 adapter 与配置来源
- state/log 路径

### `carvis doctor`

提供按需体检，不依赖系统当前是否已启动。

检查项：

- `loadRuntimeConfig()` 能否通过
- Feishu 配置是否合法
- Feishu 凭据能否拿到 tenant access token
- Postgres 是否可连接
- Redis 是否可连接
- `codex --version` 是否可用
- `carvis-schedule --help` 是否可用
- `gateway /healthz` 是否 ready
- 是否存在 `CONFIG_DRIFT`

### `carvis configure`

用于增量重配。首轮先实现最小分段能力：

- `carvis configure feishu`
- `carvis configure workspace`

`memory` 与 `triggers` 可以作为后续扩展 section，而不阻塞主路径。

## Package Boundaries

### New package: `packages/carvis-cli`

新增独立总入口包，bin 名为 `carvis`。

职责：

- 解析命令
- 引导式提问
- 写配置文件
- 启停本地 runtime 进程
- 维护本地 state
- 汇总状态和诊断输出

不负责：

- Feishu 业务协议实现
- Codex bridge 业务逻辑
- queue/lock/migration 的核心业务语义

### Existing package: `packages/carvis-schedule-cli`

继续保持 schedule 管理专用 CLI 身份，不与总入口 CLI 合并。

### Existing package: `packages/channel-feishu`

新增 adapter-owned setup/doctor 子模块，但不把 CLI prompt 逻辑塞进 `FeishuAdapter` runtime 类本体。

建议新增：

- `packages/channel-feishu/src/setup.ts`

职责：

- 提供飞书接入所需字段定义
- 提供字段说明、获取指引、默认值
- 提供输入校验
- 提供凭据 probe/doctor 能力

不负责：

- 写 `~/.carvis/config.json`
- 写 `~/.carvis/runtime.env`
- 拉起 `gateway/executor`
- 管理 pid/log/state

### Existing apps

- `apps/gateway` 和 `apps/executor` 保持当前职责
- 仅增加与 CLI 运维相关的极薄接缝，例如优雅退出和可选状态落盘

## Feishu Setup Integration

`packages/channel-feishu` 需要对外暴露 adapter-owned setup contract，供 `carvis onboard` / `carvis configure feishu` / `carvis doctor` 调用。

推荐接口：

```ts
type FeishuSetupField = {
  key: "appId" | "appSecret" | "allowFrom" | "requireMention";
  envName?: "FEISHU_APP_ID" | "FEISHU_APP_SECRET";
  required: boolean;
  label: string;
  description: string;
  howToGet: string[];
  defaultValue?: string | boolean | string[];
};

type FeishuSetupSpec = {
  adapter: "feishu";
  mode: "websocket";
  fields: FeishuSetupField[];
};

function getFeishuSetupSpec(): FeishuSetupSpec;
function validateFeishuSetupInput(input: unknown): { ok: boolean; errors: string[] };
function probeFeishuCredentials(input: {
  appId: string;
  appSecret: string;
}): Promise<{ ok: boolean; message: string }>;
```

这样飞书接入知识会集中在 adapter 包内，而 CLI 只负责交互和配置编排。

## Runtime State and Process Management

为了让 `start/stop/status` 真正可用，仅靠 pid 文件不够。当前代码存在两个现实约束：

1. `gateway` 有 `/healthz`，但 `executor` 没有独立 query surface
2. `apps/gateway/src/index.ts` 与 `apps/executor/src/index.ts` 目前没有优雅退出信号处理

因此本设计新增两层运维接缝：

### 1. Optional local runtime state sink

当环境变量例如 `CARVIS_STATE_DIR` 存在时：

- `gateway` 在启动、进入 ready、进入 degraded/failed 时，把摘要状态写到本地 JSON 文件
- `executor` 在 startup report 变化时，把摘要状态写到本地 JSON 文件

建议路径：

- `~/.carvis/state/gateway.json`
- `~/.carvis/state/executor.json`

这些状态文件只服务于本地 CLI 运维，不替代 Postgres durable state，也不改变 Redis coordination only 的角色。

### 2. Graceful shutdown

`apps/gateway` 与 `apps/executor` 的入口需要在 `import.meta.main` 场景下捕获 `SIGINT` / `SIGTERM`，调用各自已有的 `stop()` 清理逻辑，然后退出。

这样 `carvis stop` 才能成为可靠的 operator path，而不是简单发送一个粗暴 kill。

## Startup Sequence

推荐启动顺序：

1. 解析并校验配置
2. 先做同步 preflight
   - `loadRuntimeConfig()`
   - `codex --version`
   - `carvis-schedule --help`
3. 启动 `gateway`
4. 轮询 `GET /healthz`
5. 当 `gateway` ready 后启动 `executor`
6. 读取 executor startup report，等待 `ready` 或 `failed`
7. 若任一步失败，停止已拉起的进程并返回明确错误

这样做的原因：

- 让 migration 和 template scaffold 继续留在 runtime 启动链路，不额外复制逻辑
- 通过 `gateway` 先 ready，再启动 `executor`，降低双进程并发启动时的歧义
- 对操作者暴露单一成功标准，而不是“命令都跑了但系统其实没 ready”

## Failure Handling

### Onboard failures

- `codex` 或 `carvis-schedule` 不可执行
  - 不进入写配置后的假启动
  - 明确要求修复 PATH 或安装问题
- `POSTGRES_URL` / `REDIS_URL` 不可连通
  - 配置可保留
  - `start` 失败并输出明确错误
- Feishu 凭据错误或 websocket 握手失败
  - `gateway` 不算 ready
  - `onboard` 最终结果明确标注 `FEISHU_WS_DISCONNECTED` 或凭据 probe 失败
- migration 失败
  - 回滚已拉起进程
  - 保留配置、日志和错误输出

### Repeated start

- 如果 state 中已有活动 pid 且进程仍存活，`carvis start` 应拒绝重复启动，先要求 `status` 或 `stop`
- 如果 state 存在但进程已死亡，`start` 应清理 stale state 后继续

## Status Semantics

`carvis status` 必须区分三类状态：

1. 进程未运行
2. 进程运行中，但 runtime 未 ready
3. runtime ready

这意味着 status 不能只看 pid，也不能只看 `gateway /healthz`。

推荐输出结构：

- `gateway`
  - `pid`
  - `alive`
  - `healthSnapshot`
- `executor`
  - `pid`
  - `alive`
  - `lastStartupReport`
- `overall`
  - `ready`
  - `degraded`
  - `failed`
  - `starting`

## Default Configuration

`carvis onboard` 写出的最小配置建议如下：

- `agent.id = codex-main`
- `agent.bridge = codex`
- `agent.defaultWorkspace = main`
- `agent.timeoutSeconds = 5400`
- `agent.maxConcurrent = 1`
- `gateway.port = 8787`
- `gateway.healthPath = /healthz`
- `executor.pollIntervalMs = 1000`
- `workspaceResolver.registry.main = <default workspace path>`
- `workspaceResolver.chatBindings = {}`
- `workspaceResolver.sandboxModes.main = workspace-write`
- `workspaceResolver.managedWorkspaceRoot = dirname(<default workspace path>)`
- `workspaceResolver.templatePath = ~/.carvis/templates/default-workspace`
- `triggers.scheduledJobs = []`
- `triggers.webhooks = []`

Secrets 仅写入 `~/.carvis/runtime.env`：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `POSTGRES_URL`
- `REDIS_URL`

## Testing Strategy

### `packages/carvis-cli` unit tests

- parser
- onboarding 默认值推断
- config writer 的 `config.json` / `runtime.env` 拆分
- state store 的读写与 stale cleanup
- process manager 的启动顺序与失败回滚

### CLI contract tests

- `carvis onboard` 首次写出最小可运行配置
- `carvis start` 成功拉起两个进程并记录 state
- `carvis stop` 清理 state 与进程
- `carvis status` 能区分 alive 与 ready
- `carvis doctor` 对常见失败码给出稳定结果

### `channel-feishu` setup contract tests

- `getFeishuSetupSpec()` 字段与默认值
- `validateFeishuSetupInput()` 缺参/非法输入
- `probeFeishuCredentials()` 的错误分类

### Integration tests

- `onboard -> start -> status -> stop`
- 已有配置场景下重复 `start`
- gateway ready 但 executor `CODEX_UNAVAILABLE`
- migration 失败后的回滚
- Feishu websocket 不 ready 时 CLI 的状态呈现

## Documentation Updates

设计落地后，需要同步修正这些文档：

- `specs/002-local-runtime-wiring/quickstart.md`
- `docs/architecture.md`
- `AGENTS.md` 中关于本地验证和启动方式的描述

文档主叙事应从“手工维护 config/env 并分别启动两个进程”切换为“用 `carvis onboard/start/stop/status/doctor` 运维本地 runtime”。

## Open Questions Resolved

- 主入口是否使用 `onboard`：是
- 日常运维是否使用 `start/stop`：是
- adapter 配置是否需要引导式采集：是
- 飞书引导逻辑是否应该直接塞进 `FeishuAdapter`：否，应放在 `packages/channel-feishu` 的 setup/doctor 子模块
- 是否保留双进程拓扑：是
- 是否需要本地 state sink 和优雅退出：是，否则 `status/stop` 不可靠
