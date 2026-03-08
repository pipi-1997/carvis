# 任务清单：飞书 Codex 对话闭环

**输入**: `/specs/001-feishu-codex-mvp/` 下的设计文档
**前置条件**: plan.md（必需）、spec.md（用户故事必需）、research.md、data-model.md、contracts/

**测试要求**: 本功能涉及适配器、桥接器、规范事件、排队、投递和运行生命周期，因此契约测试与集成测试均为必需；单元测试按本地逻辑复杂度补充。

**组织方式**: 任务按用户故事分组，以支持每个故事独立实现与独立验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无未完成依赖）
- **[Story]**: 任务所属用户故事（如 US1、US2、US3）
- 每条任务都包含明确文件路径

## Path Conventions

- **Gateway app**: `apps/gateway/src/`
- **Executor app**: `apps/executor/src/`
- **Shared packages**: `packages/<name>/src/`
- **Tests**: `tests/contract/`, `tests/integration/`, `tests/unit/`

## Phase 1：初始化（共享基础设施）

**目的**: 建立 Bun workspace、包边界和最小项目骨架

- [x] T001 创建 Bun workspace 清单与根配置在 `package.json`、`bunfig.toml`、`tsconfig.json`
- [x] T002 创建应用与包目录骨架在 `apps/gateway/src/index.ts`、`apps/executor/src/index.ts`、`packages/core/src/index.ts`、`packages/channel-feishu/src/index.ts`、`packages/bridge-codex/src/index.ts`
- [x] T003 [P] 配置基础测试与脚本命令在 `package.json`
- [x] T004 [P] 建立共享规范类型入口与包导出边界在 `packages/core/src/domain/index.ts`

---

## Phase 2：基础能力（阻塞性前置条件）

**目的**: 在实现任何用户故事前完成运行时基础设施

**⚠️ CRITICAL**: 用户故事开发必须在本阶段完成后开始

- [x] T005 实现本地 agent 配置加载与校验在 `packages/core/src/config/agent-config.ts`
- [x] T006 创建持久化模型与初始迁移在 `packages/core/src/storage/migrations/001_initial.sql`
- [x] T007 [P] 实现 Postgres repositories for `Session`、`Run`、`RunEvent`、`OutboundDelivery` 在 `packages/core/src/storage/repositories.ts`
- [x] T008 [P] 实现 Redis 队列、workspace 锁、取消信号、执行器心跳续约与过期判定在 `packages/core/src/runtime/queue.ts`、`packages/core/src/runtime/workspace-lock.ts`、`packages/core/src/runtime/cancel-signal.ts`、`packages/core/src/runtime/heartbeat.ts`
- [x] T009 [P] 实现结构化日志与审计事件封装在 `packages/core/src/observability/logger.ts`
- [x] T010 创建 gateway 路由骨架和 executor worker 骨架在 `apps/gateway/src/app.ts`、`apps/executor/src/worker.ts`
- [x] T037 实现心跳失效回收与 active run 失败标记流程在 `apps/executor/src/heartbeat.ts`、`apps/gateway/src/services/run-reaper.ts`

**检查点**: 配置、存储、队列和运行骨架就绪，用户故事可以开始

---

## Phase 3：用户故事 1 - 对话触发运行（Priority: P1）🎯 MVP

**目标**: 用户在飞书 `chat` 里发送普通消息后，系统可以把请求路由到固定 Codex agent/workspace，并回推状态摘要与最终结果

**独立验证方式**: 发送普通消息后，系统返回排队/开始/阶段摘要/最终结果，并且运行状态可持久化查询

### 用户故事 1 的测试 ⚠️

> 先写测试并确认失败，再实现功能。

- [x] T011 [P] [US1] 编写 Feishu 入站与命令归一化契约测试在 `tests/contract/channel-feishu.contract.test.ts`
- [x] T012 [P] [US1] 编写 Codex bridge 事件映射契约测试在 `tests/contract/bridge-codex.contract.test.ts`
- [x] T013 [P] [US1] 编写“普通消息触发运行并回推摘要结果”的集成测试在 `tests/integration/feishu-codex-run.test.ts`
- [x] T038 [P] [US1] 编写“两个不同 Feishu chat 共享同一 agent/workspace 队列状态”的集成测试在 `tests/integration/feishu-shared-workspace.test.ts`
- [x] T039 [P] [US1] 编写“执行器心跳过期后 active run 被标记失败”的集成测试在 `tests/integration/run-heartbeat-expiry.test.ts`

### 用户故事 1 的实现

- [x] T014 [P] [US1] 定义 `AgentConfig`、`Session`、`RunRequest`、`Run`、`RunEvent`、`OutboundDelivery` 类型在 `packages/core/src/domain/models.ts`
- [x] T015 [P] [US1] 实现 Feishu `ChannelAdapter` 入站/出站能力在 `packages/channel-feishu/src/adapter.ts`
- [x] T016 [P] [US1] 实现 Codex `AgentBridge` 启动、摘要事件与完成事件映射在 `packages/bridge-codex/src/bridge.ts`
- [x] T017 [US1] 实现普通消息到 `RunRequest` 的 session 路由与绑定逻辑在 `apps/gateway/src/routes/feishu-webhook.ts`
- [x] T018 [US1] 实现 executor 任务消费、启动运行与事件持久化在 `apps/executor/src/run-consumer.ts`
- [x] T019 [US1] 实现状态摘要与最终结果的飞书消息回推在 `apps/gateway/src/services/run-notifier.ts`
- [x] T020 [US1] 补充启动失败、超时、投递失败与 operator-visible 日志处理在 `apps/executor/src/run-controller.ts`、`apps/gateway/src/services/run-notifier.ts`
- [x] T040 [US1] 接入心跳续约、过期失败事件写入与失败通知回推在 `apps/executor/src/run-controller.ts`、`apps/gateway/src/services/run-notifier.ts`

**检查点**: 普通消息触发运行的 MVP 完成，可独立演示

---

## Phase 4：用户故事 2 - 查询当前状态（Priority: P2）

**目标**: 用户通过 `/status` 查看当前 agent/workspace、活动运行状态、当前会话最近一次请求是否排队以及其前方队列长度

**独立验证方式**: 在无活动运行和有活动运行两种情况下调用 `/status`，都能获得与持久化状态一致的结果；若当前会话最近一次请求处于排队中，还能看到前方队列长度

### 用户故事 2 的测试 ⚠️

- [x] T021 [P] [US2] 编写 Feishu `/status` 命令契约测试在 `tests/contract/status-command.contract.test.ts`
- [x] T022 [P] [US2] 编写 `/status` 状态查询集成测试在 `tests/integration/status-command.test.ts`
- [x] T041 [P] [US2] 编写“网关或执行器重启后 `/status` 仍返回持久化状态”的集成测试在 `tests/integration/status-restart-recovery.test.ts`

### 用户故事 2 的实现

- [x] T023 [P] [US2] 扩展运行查询与队列摘要读取逻辑，返回 active run、最近一次请求排队标记与前方队列长度在 `packages/core/src/storage/repositories.ts`
- [x] T024 [US2] 实现 `/status` 命令处理器在 `apps/gateway/src/commands/status.ts`
- [x] T025 [US2] 实现状态展示格式化与消息渲染在 `apps/gateway/src/services/status-presenter.ts`
- [x] T026 [US2] 将 `/status` 接入 Feishu webhook 路由并记录查询日志在 `apps/gateway/src/routes/feishu-webhook.ts`

**检查点**: `/status` 在任何时点都能返回一致状态

---

## Phase 5：用户故事 3 - 取消当前运行（Priority: P3）

**目标**: 用户通过 `/abort` 取消当前 active run，并收到明确取消反馈

**独立验证方式**: 在存在 active run 和不存在 active run 两种情况下调用 `/abort`，结果均正确且不破坏排队项

### 用户故事 3 的测试 ⚠️

- [x] T027 [P] [US3] 编写取消信号与 run 取消契约测试在 `tests/contract/abort-command.contract.test.ts`
- [x] T028 [P] [US3] 编写 `/abort` 取消 active run 的集成测试在 `tests/integration/abort-command.test.ts`

### 用户故事 3 的实现

- [x] T029 [P] [US3] 扩展取消信号仓储与 run 取消状态写入在 `packages/core/src/runtime/cancel-signal.ts`、`packages/core/src/storage/repositories.ts`
- [x] T030 [US3] 实现 `/abort` 命令处理器在 `apps/gateway/src/commands/abort.ts`
- [x] T031 [US3] 实现 executor 侧取消轮询、进程终止和 `run.cancelled` 事件写入在 `apps/executor/src/run-controller.ts`
- [x] T032 [US3] 将 `/abort` 结果回推与失败兜底接入通知服务在 `apps/gateway/src/services/run-notifier.ts`

**检查点**: `/abort` 可独立验证，且不影响排队中的后续请求

---

## Phase 6：收尾与横切关注点

**目的**: 完成横切质量要求与文档验证

- [x] T033 [P] 更新运行闭环与状态反馈说明在 `docs/architecture.md`
- [x] T034 [P] 更新 agent 上下文和运行说明在 `AGENTS.md`、`specs/001-feishu-codex-mvp/quickstart.md`
- [x] T035 进行 webhook 验签与最小 allowlist 加固在 `packages/channel-feishu/src/signature.ts`、`apps/gateway/src/security/allowlist.ts`
- [x] T036 运行 quickstart 场景验证并修正文档在 `specs/001-feishu-codex-mvp/quickstart.md`

---

## 依赖与执行顺序

### Phase Dependencies

- **Phase 1**: 无依赖，可立即开始
- **Phase 2**: 依赖 Phase 1 完成；阻塞所有用户故事
- **Phase 3**: 依赖 Phase 2 完成；构成 MVP
- **Phase 4**: 依赖 Phase 3 的持久化与通知能力
- **Phase 5**: 依赖 Phase 3 的运行生命周期能力
- **Phase 6**: 依赖所有目标用户故事完成

### User Story Dependencies

- **US1**: Foundational 完成后即可开始，是后续故事的基础
- **US2**: 依赖 US1 已有 session/run 持久化与回推链路
- **US3**: 依赖 US1 已有 active run 生命周期

### Within Each User Story

- 先完成契约/集成测试并确认初始失败
- 再实现 domain/model 或命令处理逻辑
- 然后接入 gateway/executor 流程
- 最后补日志、失败兜底和消息展示

### Parallel Opportunities

- T003 与 T004 可并行
- T007、T008、T009 可并行
- T011、T012、T013、T038、T039 可并行
- US1 的 T014、T015、T016 可并行
- US2 的 T021、T022、T041 可并行
- US3 的 T027、T028 可并行
- Phase 6 的 T033、T034 可并行

---

## Parallel Example: User Story 1

```bash
Task: "编写 Feishu 入站与命令归一化契约测试在 tests/contract/channel-feishu.contract.test.ts"
Task: "编写 Codex bridge 事件映射契约测试在 tests/contract/bridge-codex.contract.test.ts"
Task: "编写普通消息触发运行并回推摘要结果的集成测试在 tests/integration/feishu-codex-run.test.ts"
```

---

## 实施策略

### MVP First（只做用户故事 1）

1. 完成 Phase 1：初始化
2. 完成 Phase 2：基础能力
3. 完成 Phase 3：对话触发运行
4. 停下来验证普通消息闭环、持久化状态和摘要回推

### 增量交付

1. 先交付普通消息触发运行
2. 再补 `/status`
3. 最后补 `/abort`
4. 每个故事都维持独立可验证

### 实现注意事项

- 所有任务都必须保持 `chat -> session -> agent -> workspace` 的固定路由语义
- 契约与集成测试不能被省略
- 涉及运行生命周期的任务必须同步维护 operator-visible 状态
- 不要在本轮引入 Telegram、Claude Code、scheduler 或 admin UI
