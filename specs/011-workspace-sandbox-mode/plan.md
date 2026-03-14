# 实施计划：工作区 Codex Sandbox 模式

**分支**: `011-workspace-sandbox-mode` | **日期**: 2026-03-14 | **规格说明**: [spec.md](/Users/pipi/workspace/carvis/specs/011-workspace-sandbox-mode/spec.md)
**输入**: 来自 `/specs/011-workspace-sandbox-mode/spec.md` 的功能规格说明

**说明**: 本模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/plan-template.md`。

## 摘要

本功能为 Carvis 现有 Feishu + Codex + trigger 运行链路补上“按工作区声明 Codex sandbox mode”的能力，并允许 Feishu `chat` 通过 `/mode` 临时覆盖当前工作区默认值。实现上保持 `gateway -> queue -> executor -> bridge-codex` 的既有职责：`packages/core` 扩展 runtime config、领域模型、仓储与迁移，新增工作区默认 sandbox 配置读取、chat override 持久化以及 run 审计字段；`apps/gateway` 在 run 入队前解析最终 sandbox mode，并把 `/mode`、`/status`、`/new` 与 `/bind` 的命令语义串起来；`apps/executor` 继续只消费持久化后的 run，同时在 continuation 与 sandbox mode 不一致时强制 fresh；`packages/bridge-codex` 只负责把 `resolvedSandboxMode` 映射到 `codex exec --sandbox ...`。

本轮不新增 approval policy、`read-only` 模式或 trigger 级自定义权限。scheduled job 和 external webhook 永远只使用工作区默认 sandbox mode，不读取 chat override。Feishu `chat` 的 sandbox override 固定持续 30 分钟。为避免权限与上下文混淆，`/new` 和工作区切换都清理当前 chat 的 sandbox override；当 sandbox mode 发生变化时，后续普通消息不跨 mode 续用既有 Codex continuation。

## 技术上下文

- **语言/版本**: Bun 1.3.x、TypeScript 5.9.x
- **主要依赖**: Hono、Zod、PostgreSQL client、Redis client、`@larksuiteoapi/node-sdk`、Codex CLI
- **存储**: PostgreSQL、Redis、runtime config file
- **测试**: `bun test`、`bun run lint`、`bunx tsc --noEmit`
- **目标平台**: 本地双进程 runtime（gateway + executor）、Feishu webhook / websocket 入站、scheduled job、external webhook、Codex CLI 宿主机执行
- **项目类型**: gateway、executor、shared package、adapter package、bridge package
- **渠道范围**: Feishu、Scheduler、External Webhook
- **智能体范围**: Codex
- **运行拓扑**: `gateway` 负责工作区解析、命令路由、sandbox mode 解析与 queued run 持久化；`executor` 继续负责队列消费、工作区锁、run heartbeat、Codex 执行与结果回写；`bridge-codex` 仅消费 run 上的 `resolvedSandboxMode` 并映射 CLI 参数；queue / lock / timeout / heartbeat 语义保持不变
- **可观测性**: 结构化运行日志、持久化 run 审计字段、chat override 持久化状态、`/status` 用户可见状态、trigger status presenter 对 sandbox mode 的投影、以及“运行成功但通知投递失败”与“运行本身失败”的区分
- **性能目标**: sandbox mode 解析与 override 读取不应显著增加 run 创建时延；30 分钟 override 过期采用读时懒判定，不增加后台轮询；`/mode`、`/status`、`/new` 的响应体验保持与现有命令同量级
- **约束条件**: one active run per workspace、webhook-only inbound、host-local workspaces、Postgres 为 durable state、Redis 仅作协调、sandbox mode 必须在入队前解析并冻结、不同 sandbox mode 不允许跨 mode 续用 continuation
- **规模/范围**: 单 agent 起步、多个工作区、多个飞书会话可共享同一 workspace 但保持各自 override、scheduled job 与 external webhook 只走工作区默认 mode；首版 override TTL 固定为 30 分钟，不支持用户自定义 TTL、`read-only`、approval policy 或非 Feishu 命令入口

## 宪法检查

*门禁：在 Phase 0 research 开始前必须通过；在 Phase 1 design 后重新检查。*

- [x] **Boundary Integrity**: 改动限制在 `apps/gateway`、`apps/executor`、`packages/core`、`packages/bridge-codex` 与现有测试层；Feishu 命令和 trigger 路由继续留在 `gateway` / `channel-feishu`，Codex CLI 细节继续留在 `bridge-codex`。
- [x] **Durable Lifecycle**: 计划新增工作区默认 sandbox 配置、chat override 持久化、run 审计字段和 `/status` 聚合字段，并明确投递失败后仍保持可审计。
- [x] **Workspace Safety**: 本功能显式确认 queue、lock、cancel、timeout、heartbeat 语义保持不变；sandbox mode 只影响 Codex 运行权限与 continuation 边界，不影响调度。
- [x] **Operability**: 计划覆盖 `/mode` 设置、过期回退、`/new` 清理、`/bind` 清理、run 审计字段和 trigger/operator 查询面。
- [x] **Verification**: 计划覆盖 runtime config、Feishu 命令契约、bridge 参数映射、run 持久化、continuation fresh 边界、trigger path 一致性和 operator 可见性。

**Phase 0 结论**:

- [x] **Boundary Integrity**: `workspaceResolver.sandboxModes` 作为 runtime config 扩展，chat override 作为独立 Postgres 实体，避免把权限状态塞进 `ConversationSessionBinding`；`bridge-codex` 只接收 canonical `resolvedSandboxMode`。
- [x] **Durable Lifecycle**: 已确认需要为 run 增加 `requestedSandboxMode`、`resolvedSandboxMode`、`sandboxModeSource`，为 chat override 增加 durable entity，并在 continuation 绑定上记录建立该 bridge session 的 sandbox mode。
- [x] **Workspace Safety**: 已确认 sandbox mode 必须在入队前冻结，排队中的 run 不受后续 override 变化影响；mode 切换只影响是否继续 resume，不改变 queue/lock。
- [x] **Operability**: 已确认 `/status`、trigger presenter、结构化日志和 run 审计字段都是 operator 可见面的组成部分，本轮无需新增 run event type。
- [x] **Verification**: 已识别需要新增 config/command/bridge/run-flow/trigger path 的 contract、integration 和 unit 覆盖，可以进入 Phase 1 设计。

**Phase 1 设计后复核**:

- [x] **Boundary Integrity**: `data-model.md` 与 `contracts/` 明确了 config、gateway、executor、bridge 各层职责，没有把 Feishu 或 Codex 特定控制流泄漏到共享 runtime 之外。
- [x] **Durable Lifecycle**: `ChatSandboxOverride`、扩展后的 `Run` 和 `ConversationSessionBinding` 已覆盖权限来源、fresh 边界和终态审计，满足 Postgres durable state 要求。
- [x] **Workspace Safety**: `contracts/codex-sandbox-resolution.md` 明确了 run 入队前解析、排队期间冻结、mode 切换强制 fresh，以及 queue/lock/heartbeat 不变。
- [x] **Operability**: `quickstart.md` 和 research 决策已覆盖 `/mode`、`/status`、`/new`、trigger 查询与结构化日志的用户侧和运维侧表现。
- [x] **Verification**: 本计划已为 runtime config、gateway 命令、bridge-codex CLI 参数映射、trigger presenter 和 continuation 边界列出明确测试目标，可直接进入 `/speckit.tasks`。

## 项目结构

### 文档产物（本功能）

```text
specs/011-workspace-sandbox-mode/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── codex-sandbox-resolution.md
│   └── feishu-sandbox-mode-commands.md
└── tasks.md
```

### 源码结构（仓库根目录）

```text
apps/
├── gateway/
└── executor/

packages/
├── core/
├── channel-feishu/
└── bridge-codex/

tests/
├── contract/
├── integration/
└── unit/
```

**结构决策**:

- 修改 `packages/core`：扩展 runtime config / domain models / runtime models / repositories / migrations / logger，新增工作区默认 sandbox 配置读取、chat override repository、run 审计字段和状态聚合字段；同时把这些配置纳入 runtime fingerprint。
- 修改 `apps/gateway`：新增 `/mode` 命令处理、sandbox mode resolver、`/status` 聚合与展示、`/new` 与 `/bind` 的 override 清理，以及普通消息 / scheduled job / external webhook 三条入队路径的 sandbox mode 解析。
- 修改 `apps/executor`：在 continuation 请求前对比当前 continuation binding 的 `sandboxMode` 与 run 的 `resolvedSandboxMode`，必要时强制 fresh，并在 run 成功后回写新的 binding mode。
- 修改 `packages/bridge-codex`：将现有硬编码 `workspace-write` 替换为 run 驱动的 `resolvedSandboxMode`，保持新会话和 resume 会话都走同一映射。
- 修改 `tests`：继续沿用现有 `unit` / `integration` / `contract` 分层，不新增新测试框架或新 package。

## 复杂度追踪

> **仅当宪法检查存在必须说明的例外时填写**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
