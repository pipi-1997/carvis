# 任务清单：调度器与外部 Webhook 触发

**输入**: `/specs/006-scheduler-external-webhooks/` 下的设计文档
**前置条件**: `plan.md`、`spec.md`、`research.md`、`data-model.md`、`contracts/`

**测试要求**: 本功能触及 scheduler、external webhook、queueing、delivery、canonical run lifecycle 和 executor/gateway 协作，因此每个用户故事都必须包含契约测试与集成测试；对 schedule 计算、鉴权和模板变量注入补充必要单元测试。

**组织方式**: 任务按用户故事分组，以支持每个故事独立实现与独立验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行执行（不同文件、无未完成前置依赖）
- **[Story]**: 对应用户故事（`[US1]`、`[US2]`、`[US3]`）
- 每条任务都包含明确文件路径

## Phase 1：初始化（共享触发夹具与测试支撑）

**目的**: 为 scheduler / external webhook 功能准备统一的 runtime 配置夹具、时钟控制和 trigger 断言工具。

- [ ] T001 扩展 trigger runtime 配置夹具，支持 scheduled jobs、external webhooks、delivery target 和 webhook secrets in `tests/support/runtime-harness.ts`
- [ ] T002 [P] 扩展集成 harness，支持 sessionless run、trigger execution、同步 webhook 响应与 trigger delivery 断言 in `tests/support/harness.ts`

---

## Phase 2：基础能力（阻塞性前置条件）

**目的**: 建立 trigger domain model、持久化层、gateway 共享编排与 sessionless run 基础设施。

**⚠️ CRITICAL**: 在本阶段完成前不要开始任何用户故事实现。

- [ ] T003 更新 canonical trigger/domain 类型、sessionless run 字段和导出入口 in `packages/core/src/domain/models.ts`, `packages/core/src/domain/runtime-models.ts`, `packages/core/src/index.ts`
- [ ] T004 [P] 扩展 runtime config schema、fingerprint 输入和 secret 加载以支持 trigger definitions 与 webhook secrets in `packages/core/src/config/runtime-config.ts`
- [ ] T005 新增 trigger definitions / trigger executions 持久化 schema，并调整 run / delivery 列允许 non-chat trigger 元数据 in `packages/core/src/storage/migrations/006_trigger_definitions.sql`
- [ ] T006 实现 `TriggerDefinitionRepository`、`TriggerExecutionRepository`，并扩展 `RunRepository` / `DeliveryRepository` 支持可空 `sessionId`、`triggerExecutionId` 和 `deliveryTarget` in `packages/core/src/storage/repositories.ts`
- [ ] T007 [P] 为 trigger config、history-preserving definition sync 与仓储变更补充单元测试 in `tests/unit/runtime-config.test.ts`, `tests/unit/postgres-repositories.test.ts`, `tests/unit/trigger-definition-sync.test.ts`
- [ ] T008 创建共享 trigger 编排服务，用于 history-preserving definition sync、scheduler 扫描和 canonical run dispatch in `apps/gateway/src/services/trigger-definition-sync.ts`, `apps/gateway/src/services/scheduler-loop.ts`, `apps/gateway/src/services/trigger-dispatcher.ts`
- [ ] T009 将 trigger 服务接入 gateway runtime wiring 与应用路由注册 in `apps/gateway/src/bootstrap.ts`, `apps/gateway/src/app.ts`, `packages/core/src/runtime/runtime-factory.ts`
- [ ] T010 适配 executor / notifier 事件接口，使 run lifecycle 可以在无 `Session` 的情况下继续执行与通知 in `apps/executor/src/run-consumer.ts`, `apps/executor/src/run-controller.ts`, `apps/gateway/src/services/run-notifier.ts`

**检查点**: trigger definitions、trigger executions、sessionless run 和 gateway 编排基础设施已就绪，用户故事可以开始推进。

---

## Phase 3：用户故事 1 - 按计划自动运行（优先级：P1）🎯 MVP

**目标**: 让已启用的 scheduled job 在到达计划窗口时自动创建 trigger execution 和 run，并继续遵守既有 queue / lock / executor 语义。

**独立验证方式**: 配置一个 due scheduled job，验证其自动入队、workspace 忙时排队、终态后可选投递到 Feishu chat。

### 用户故事 1 的测试 ⚠️

- [ ] T011 [P] [US1] 新增 scheduled job lifecycle 契约测试，覆盖 accepted、queued、running、completed 与共享 workspace 排队语义 in `tests/contract/trigger-lifecycle.contract.test.ts`
- [ ] T012 [P] [US1] 新增 scheduled job due dispatch、queueing、终态 delivery 和 due-to-queued 延迟预算验证的集成测试 in `tests/integration/scheduler-trigger.test.ts`

### 用户故事 1 的实现

- [ ] T013 [P] [US1] 实现 scheduled job definition sync、`nextDueAt` 计算和 disabled definition 的 skipped 记录 in `apps/gateway/src/services/trigger-definition-sync.ts`, `apps/gateway/src/services/scheduler-loop.ts`
- [ ] T014 [US1] 实现 scheduled job 到 `TriggerExecution` / sessionless `Run` 的 canonical dispatch 和入队逻辑 in `apps/gateway/src/services/trigger-dispatcher.ts`, `packages/core/src/storage/repositories.ts`
- [ ] T015 [US1] 实现 scheduled job 的 sessionless run 执行与终态-only Feishu delivery 语义 in `apps/executor/src/run-consumer.ts`, `apps/executor/src/run-controller.ts`, `apps/gateway/src/services/run-notifier.ts`
- [ ] T016 [US1] 扩展 scheduler 相关结构化日志、health state 和 operator-visible missed/skipped/queued 记录，并暴露 definition sync 摘要 in `packages/core/src/observability/runtime-logger.ts`, `apps/gateway/src/services/runtime-health.ts`, `apps/gateway/src/bootstrap.ts`

**检查点**: scheduled job 可以独立触发运行，不依赖聊天入口，且不会绕过现有 workspace 串行化规则。

---

## Phase 4：用户故事 2 - 外部事件触发预定义任务（优先级：P1）

**目标**: 让 external webhook 只命中预注册 definition，通过 HMAC 验签和 payload 校验后创建 trigger execution 与 run。

**独立验证方式**: 发送合法与非法 webhook 请求，验证 accepted/rejected 同步回执、payload 变量注入和 workspace/agent 不可被 payload 覆盖。

### 用户故事 2 的测试 ⚠️

- [ ] T017 [P] [US2] 新增 external webhook 契约测试，覆盖 definition 匹配、HMAC 验签、payload 校验和 accepted/rejected 响应 in `tests/contract/external-webhook.contract.test.ts`
- [ ] T018 [P] [US2] 新增 external webhook accepted/rejected、模板变量注入、与活动 run 共享 workspace 锁以及 2 秒同步响应预算验证的集成测试 in `tests/integration/external-webhook.test.ts`

### 用户故事 2 的实现

- [ ] T019 [P] [US2] 实现 external webhook 验签与 payload 校验辅助逻辑 in `apps/gateway/src/services/external-webhook-auth.ts`, `apps/gateway/src/services/external-webhook-payload.ts`
- [ ] T020 [US2] 实现 external webhook ingress 路由与同步 accepted/rejected HTTP 回执 in `apps/gateway/src/routes/external-webhook.ts`, `apps/gateway/src/app.ts`
- [ ] T021 [US2] 将 external webhook 请求接入 trigger execution 持久化、模板渲染和 canonical run dispatch in `apps/gateway/src/services/trigger-dispatcher.ts`, `apps/gateway/src/bootstrap.ts`
- [ ] T022 [US2] 扩展 webhook 审计与 operator 日志，覆盖 unknown slug、disabled definition、鉴权失败和 payload rejection in `packages/core/src/observability/runtime-logger.ts`, `apps/gateway/src/routes/external-webhook.ts`

**检查点**: external webhook 可以安全地触发预定义任务，并且所有入口拒绝路径都可同步观测与审计。

---

## Phase 5：用户故事 3 - 触发状态可见且可控（优先级：P2）

**目标**: 让 operator 能从 gateway 的内部管理查询面和持久化状态中看到 definition、trigger execution、run 和 delivery 的完整结果链路。

**独立验证方式**: 制造 disabled definition、missed window、heartbeat expiry、delivery failure 和 no-delivery target 场景，确认 operator 能区分 rejected/skipped/missed/run terminal/heartbeat_expired/delivery_failed。

### 用户故事 3 的测试 ⚠️

- [ ] T023 [P] [US3] 新增 trigger visibility 契约测试，覆盖内部管理查询面、missed、skipped、rejected、heartbeat_expired、delivery_failed 和 non-chat `fresh` 语义 in `tests/contract/trigger-visibility.contract.test.ts`
- [ ] T024 [P] [US3] 新增 operator-visible trigger 状态集成测试，覆盖内部管理查询面、disabled definitions、missed windows、heartbeat expiry、delivery failures 和 no-delivery targets in `tests/integration/trigger-visibility.test.ts`

### 用户故事 3 的实现

- [ ] T025 [P] [US3] 实现 trigger definition / execution 查询接口、状态迁移和 delivery target 解析辅助逻辑 in `packages/core/src/storage/repositories.ts`, `apps/gateway/src/services/trigger-status-presenter.ts`, `apps/gateway/src/services/trigger-delivery-resolver.ts`
- [ ] T026 [US3] 实现 gateway 内部 trigger 状态查询路由，并返回 definition / execution / run / delivery 关联结果 in `apps/gateway/src/routes/internal-triggers.ts`, `apps/gateway/src/app.ts`, `apps/gateway/src/bootstrap.ts`
- [ ] T027 [US3] 更新 notifier、terminal 渲染、presentation 与 run reaper 逻辑，使 non-chat runs 不发送 reaction/card，并将 `heartbeat_expired` 与 `delivery_failed` 和 run terminal 状态分离持久化 in `apps/gateway/src/services/run-notifier.ts`, `apps/gateway/src/services/terminal-result-renderer.ts`, `apps/gateway/src/services/presentation-orchestrator.ts`, `apps/gateway/src/services/run-reaper.ts`
- [ ] T028 [US3] 补充 operator 契约与架构文档，覆盖内部管理查询面、missed window、heartbeat expiry、delivery failure 和 trigger config sync 场景 in `specs/006-scheduler-external-webhooks/contracts/trigger-lifecycle.md`, `docs/architecture.md`

**检查点**: operator 无需登录宿主机即可判断 trigger 是否触发、为何被拒绝或跳过，以及 run 与 delivery 的最终结果。

---

## Phase 6：收尾与横切关注点

**目的**: 补齐跨故事回归、低层单元测试和最终验证路径。

- [ ] T029 [P] 为 schedule 计算、webhook HMAC 验签和 payload 模板注入补充单元测试 in `tests/unit/scheduler-loop.test.ts`, `tests/unit/external-webhook-auth.test.ts`, `tests/unit/external-webhook-payload.test.ts`
- [ ] T030 [P] 为 chat-triggered run、scheduled job 和 external webhook 共享同一 workspace 的 FIFO 队列行为补充集成回归测试 in `tests/integration/trigger-shared-workspace.test.ts`
- [ ] T031 [P] 为 trigger config sync、内部管理查询面、sessionless run、时延预算验证和 terminal-only delivery 更新本地验证步骤与示例文档 in `specs/006-scheduler-external-webhooks/quickstart.md`, `specs/006-scheduler-external-webhooks/contracts/external-webhook.md`
- [ ] T032 运行 `bun test`、`bun run lint` 并根据结果修正 `specs/006-scheduler-external-webhooks/quickstart.md` 中的最终验证步骤 in `specs/006-scheduler-external-webhooks/quickstart.md`

---

## 依赖与执行顺序

### Phase Dependencies

- **Phase 1：初始化**: 无依赖，可立即开始
- **Phase 2：基础能力**: 依赖 Phase 1；阻塞所有用户故事
- **Phase 3：US1**: 依赖 Phase 2；这是 MVP，建议最先完成
- **Phase 4：US2**: 依赖 Phase 2，并建议在 US1 的 trigger dispatch 基础上推进
- **Phase 5：US3**: 依赖 Phase 2，并建议在 US1 / US2 完成后推进，以便复用完整 trigger execution 与 delivery 状态
- **Phase 6：收尾**: 依赖所有目标用户故事完成

### User Story Dependencies

- **US1 (P1)**: 无用户故事级前置依赖，是最小可交付闭环
- **US2 (P1)**: 依赖基础能力；为了复用 canonical trigger dispatch，建议在 US1 之后实现
- **US3 (P2)**: 依赖基础能力；为了完整展示 trigger execution 与 delivery 结果，建议在 US1 和 US2 之后实现

### Within Each User Story

- 先写契约测试和集成测试，并确认其在实现前失败
- 先完成 shared model / repository / helper，再完成 route / scheduler / notifier 逻辑
- 先保证 canonical run dispatch 与 queue/lock 一致，再补 observability 和 operator 文档
- 每个故事完成后先做独立验证，再进入下一个故事

### Parallel Opportunities

- Phase 1 中 `T002` 可与 `T001` 并行
- Phase 2 中 `T004`、`T007` 可在 `T003` 明确模型后并行推进
- US1 中 `T011`、`T012`、`T013` 可并行
- US2 中 `T017`、`T018`、`T019` 可并行
- US3 中 `T023`、`T024`、`T025` 可并行
- 收尾阶段 `T029`、`T030`、`T031` 可并行

---

## Parallel Example：用户故事 1

```bash
# 先并行准备 scheduler 的测试和 due 计算
Task: "T011 [US1] 新增 scheduled job lifecycle 契约测试 in tests/contract/trigger-lifecycle.contract.test.ts"
Task: "T012 [US1] 新增 scheduled job due dispatch、queueing、终态 delivery 和 due-to-queued 延迟预算验证的集成测试 in tests/integration/scheduler-trigger.test.ts"
Task: "T013 [US1] 实现 scheduled job definition sync、nextDueAt 计算和 skipped 记录 in apps/gateway/src/services/trigger-definition-sync.ts, apps/gateway/src/services/scheduler-loop.ts"
```

## Parallel Example：用户故事 2

```bash
# 先并行准备 webhook 契约和入口辅助逻辑
Task: "T017 [US2] 新增 external webhook 契约测试 in tests/contract/external-webhook.contract.test.ts"
Task: "T018 [US2] 新增 external webhook accepted/rejected、模板变量注入、共享 workspace 锁和 2 秒响应预算验证的集成测试 in tests/integration/external-webhook.test.ts"
Task: "T019 [US2] 实现 external webhook 验签与 payload 校验辅助逻辑 in apps/gateway/src/services/external-webhook-auth.ts, apps/gateway/src/services/external-webhook-payload.ts"
```

## Parallel Example：用户故事 3

```bash
# 先并行准备可观测性测试和 trigger 查询能力
Task: "T023 [US3] 新增 trigger visibility 契约测试 in tests/contract/trigger-visibility.contract.test.ts"
Task: "T024 [US3] 新增 operator-visible trigger 状态集成测试 in tests/integration/trigger-visibility.test.ts"
Task: "T025 [US3] 实现 trigger definition / execution 查询接口、状态迁移和 delivery target 解析 in packages/core/src/storage/repositories.ts, apps/gateway/src/services/trigger-status-presenter.ts, apps/gateway/src/services/trigger-delivery-resolver.ts"
```

---

## 实施策略

### MVP First（仅交付用户故事 1）

1. 完成 Phase 1：初始化
2. 完成 Phase 2：基础能力
3. 完成 Phase 3：用户故事 1
4. 运行 US1 的契约测试与集成测试，确认 scheduled job 闭环成立
5. 如需尽快交付，可先上线 scheduler trigger 能力，再继续 webhook 与 operator 增强

### Incremental Delivery

1. Setup + Foundational 完成后，先交付 US1，建立非聊天 trigger 的最小执行闭环
2. 在 US1 稳定后交付 US2，让外部系统可安全触发预定义任务
3. 最后交付 US3，完善 operator-visible 状态和文档
4. 每个故事交付后都运行对应 contract / integration 覆盖，再合并到主线

### Parallel Team Strategy

1. 一名开发者先完成 Phase 1 和 Phase 2
2. 基础能力就绪后：
   - 开发者 A：推进 US1 的 scheduler 与 dispatch
   - 开发者 B：推进 US2 的 webhook ingress 与鉴权
   - 开发者 C：推进 US3 的 visibility / delivery state
3. 最后统一完成横切回归与 operator 文档

---

## Notes

- [P] 任务表示可以并行，但前提是不共享未完成前置依赖
- 所有触及 scheduler、webhook、queueing、delivery、run lifecycle 的故事都已显式列出 contract / integration 测试
- non-chat trigger 明确采用 sessionless run；不得通过伪造 `Session` 绕开实现
- external webhook payload 只允许注入模板变量，不得覆盖 definition 绑定的 `workspace`、`agentId` 或 `deliveryTarget`
- operator-visible 状态必须通过基于 Postgres 的内部管理查询面或等价 read model 提供，不能退化成“让 operator 自己查日志”
- 收尾前必须验证 chat-triggered run 与 trigger-triggered run 共用同一 workspace 时，FIFO 队列语义仍然成立
