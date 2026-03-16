# 实施计划：Carvis Onboard CLI

**分支**: `013-carvis-onboard-cli` | **日期**: 2026-03-15 | **规格说明**: [spec.md](/Users/pipi/workspace/carvis/.worktrees/013-carvis-onboard-cli/specs/013-carvis-onboard-cli/spec.md)
**输入**: 来自 `/specs/013-carvis-onboard-cli/spec.md` 的功能规格说明

**说明**: 本模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/plan-template.md`。

## 摘要

本功能为 `carvis` 增加一个 operator-facing 总入口 CLI，使首次使用者可以通过 `carvis onboard` 完成飞书接入、本地运行依赖和默认 workspace 的引导式配置，并在流程结束时自动尝试启动本地双进程 runtime。长期运维则通过 `carvis start`、`carvis stop`、`carvis status`、`carvis doctor` 和 `carvis configure` 统一收口，避免操作者继续手工维护 `~/.carvis/config.json`、`~/.carvis/runtime.env` 以及两个独立进程的生命周期；`configure` 首轮至少覆盖 `feishu` 与 `workspace` 两个局部重配段。

实现上保持现有边界不变：新增 `packages/carvis-cli` 作为总入口；`packages/channel-feishu` 新增 setup/doctor 子模块，用于对外暴露飞书接入字段、默认值、获取指引和凭据 probe；`packages/core` 新增可选的本地 runtime state sink；`apps/gateway` 与 `apps/executor` 只补充优雅退出和状态落盘接缝。Postgres durable state、Redis coordination only、`ChannelAdapter` / `AgentBridge` 边界、单工作区单活动运行、queue/lock/cancel/timeout/heartbeat 和 canonical run lifecycle 语义均保持不变。

## 技术上下文

- **语言/版本**: Bun 1.3.x、TypeScript 5.9.x
- **主要依赖**: Hono、Zod、`pg`、`redis`、`@larksuiteoapi/node-sdk`
- **存储**: PostgreSQL、Redis、`~/.carvis/` 本地配置/状态文件
- **测试**: `bun test`、`bun run lint`、`bunx tsc --noEmit`
- **目标平台**: 本地单机双进程 runtime、Feishu websocket 接入、Codex CLI 宿主机执行
- **项目类型**: gateway、executor、shared package、adapter package、bridge package、新增 operator CLI package
- **渠道范围**: Feishu
- **智能体范围**: Codex
- **运行拓扑**: `carvis` CLI 编排 `gateway` 与 `executor` 两个子进程；`gateway` 继续提供 `/healthz` 和 Feishu websocket ingress；`executor` 继续通过 startup report 暴露 readiness，并消费既有 queue/lock/run lifecycle
- **可观测性**: `gateway /healthz`、executor startup report、结构化 runtime logs、本地 state sink、CLI `status` 与 `doctor`
- **性能目标**: CLI 预检查、状态汇总和 doctor 不显著放大现有启动时延；`status` / `doctor` 应保持本地交互式响应速度
- **约束条件**: one active run per workspace、websocket-only inbound、host-local workspaces、Postgres 为 durable state、Redis 仅作协调、当前唯一真实 adapter 为 Feishu、当前唯一 bridge 为 Codex
- **规模/范围**: 单机部署、单 agent、多 workspace、本地 operator 使用场景

## 宪法检查

*门禁：在 Phase 0 research 开始前必须通过；在 Phase 1 design 后重新检查。*

- [x] **Boundary Integrity**: 新增 `packages/carvis-cli` 仅负责 operator-facing 配置与进程编排；adapter-specific setup 继续留在 `packages/channel-feishu`；bridge-specific healthcheck 继续留在 `packages/bridge-codex`；不把 Feishu/Codex 特定控制流泄漏到共享 runtime 代码。
- [x] **Durable Lifecycle**: 本功能不修改 canonical run persistence；新增的本地 state sink 仅服务于 operator CLI，可选启用，不替代 Postgres durable state。
- [x] **Workspace Safety**: queue、lock、cancel、timeout、heartbeat、单工作区单活动运行等语义保持不变；CLI 只编排 runtime 生命周期，不改变调度与执行约束。
- [x] **Operability**: 计划显式覆盖 `status`、`doctor`、本地 state sink、优雅退出、启动失败回滚、`gateway /healthz`、executor startup report、常见错误码投影与 runbook 更新。
- [x] **Verification**: 已识别 CLI parser/config/state、Feishu setup contract、runtime state sink、优雅退出、生命周期命令与全链路集成验证点。

**Phase 0 结论**:

- [x] **Boundary Integrity**: 研究确认“飞书引导信息归 adapter 包、CLI 只消费 contract”是保持边界清晰的最小方案；不需要把 prompt 或文件写入逻辑放进 `FeishuAdapter` 类。
- [x] **Durable Lifecycle**: 研究确认 CLI 需要本地 state sink 支撑 `status/stop`，但该 state 只反映进程与本地 readiness，不进入业务 durable state。
- [x] **Workspace Safety**: 研究确认 CLI 不接触 queue/lock/run semantics，只读取既有健康面与 startup report。
- [x] **Operability**: 研究确认 `start/stop/status/doctor` 必须基于现有 `gateway /healthz`、executor startup report、Feishu probe、Codex healthcheck 和 stale state 管理构建，并同步形成 operator runbook。
- [x] **Verification**: 研究确认需要同时补 unit、contract、integration 三层覆盖，尤其是重复启动、部分失败回滚与已有配置复用路径。

**Phase 1 设计后复核**:

- [x] **Boundary Integrity**: `data-model.md` 和 contracts 已把 `packages/carvis-cli`、`packages/channel-feishu`、`packages/core`、`apps/gateway`、`apps/executor` 的职责清晰分层。
- [x] **Durable Lifecycle**: 设计明确本地 state sink 是 operator-only 视图，不改变 Postgres/Redis 的既有角色；canonical run lifecycle 不受影响。
- [x] **Workspace Safety**: 设计明确 `start/stop` 只管理本地 runtime 进程，不引入新的执行器、队列或锁路径。
- [x] **Operability**: `quickstart.md` 和 contracts 已明确 ready/degraded/failed、重复启动保护、stale state 清理与优雅退出语义。
- [x] **Verification**: 本计划已列出 Feishu setup、CLI lifecycle、runtime state sink、优雅退出、onboard/start/stop/status/doctor 的测试目标，可直接进入 `/speckit.tasks` 执行。

## 项目结构

### 文档产物（本功能）

```text
specs/013-carvis-onboard-cli/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── carvis-cli-lifecycle.md
│   └── feishu-setup-contract.md
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
├── bridge-codex/
├── carvis-schedule-cli/
└── carvis-cli/

tests/
├── contract/
├── integration/
└── unit/
```

**结构决策**:

- 新增 `packages/carvis-cli`：承载 `onboard/start/stop/status/doctor/configure`
- 修改 `packages/channel-feishu`：新增 `setup.ts`，暴露 Feishu setup/doctor 合同
- 修改 `packages/core`：新增可选本地 runtime state sink，并导出 CLI 所需类型/工具
- 修改 `apps/gateway` 与 `apps/executor`：补优雅退出信号处理，并在 CLI 场景下通过实际状态变更接缝写本地状态摘要
- 修改 `tests`：新增 CLI 与 Feishu setup 相关的 unit/contract/integration 覆盖
- 修改文档：更新 `specs/002-local-runtime-wiring/quickstart.md`、`docs/architecture.md`、`AGENTS.md`、`docs/runbooks/local-runtime-cli.md`

## 复杂度追踪

> **仅当宪法检查存在必须说明的例外时填写**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 新增 `packages/carvis-cli` | 需要一个总入口承接 onboarding 与 operator lifecycle，不适合复用 `carvis-schedule` | 复用现有 schedule CLI 会破坏其领域边界，并把 operator 生命周期命令混入 schedule 控制面 |
| 新增本地 runtime state sink | `status/stop` 需要稳定读取 executor 状态和本地运行元信息 | 只依赖 pid 文件无法区分 ready 状态；只解析日志太脆弱；新增 executor HTTP 面会扩大系统表面 |
