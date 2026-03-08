# 任务清单：Feishu 卡片结果增强

**输入**: `/specs/003-feishu-cardkit-results/` 下的设计文档
**前置条件**: plan.md（必需）、spec.md（用户故事必需）、research.md、data-model.md、contracts/

**测试要求**: 本功能涉及 Feishu adapter、Codex bridge、规范事件、出站投递和运行生命周期呈现，因此契约测试与集成测试均为必需；单元测试用于覆盖富文本恢复、单消息约束和 sender 负载组装等局部逻辑。

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

**目的**: 刷新测试夹具与验证入口，使后续任务基于“单消息富文本卡片”新语义执行

- [ ] T001 更新 Feishu 假 sender 与运行时夹具，支持“同一张卡片终态切换”“fallback-only terminal message”和富文本断言在 `tests/support/harness.ts`、`tests/support/runtime-harness.ts`
- [ ] T002 [P] 更新共享验证入口与基础断言工具，覆盖单消息约束和终态卡片快照辅助在 `tests/unit/presentation-setup.test.ts`、`tests/unit/runtime-services.test.ts`

---

## Phase 2：基础能力（阻塞性前置条件）

**目的**: 在实现任何用户故事前完成共享模型、仓储、可观测性和 sender 边界更新

**⚠️ CRITICAL**: 用户故事开发必须在本阶段完成后开始

- [ ] T003 更新单消息呈现相关领域模型与导出，替换 `fallbackTerminalMessageId` / `fallback_terminal` 语义为终态卡片与 fallback 语义在 `packages/core/src/domain/models.ts`、`packages/core/src/domain/runtime-models.ts`、`packages/core/src/domain/index.ts`
- [ ] T004 创建并应用 `RunPresentation` 新迁移，落地 `fallbackTerminalMessageId`、`singleMessageViolation` 等持久化字段在 `packages/core/src/storage/migrations/003_single_message_presentation.sql`、`packages/core/src/storage/migrate.ts`、`packages/core/src/storage/repositories.ts`
- [ ] T005 [P] 扩展结构化日志与 delivery 审计，记录 `fallback_terminal`、终态卡片送达和单消息违约状态在 `packages/core/src/observability/logger.ts`、`packages/core/src/observability/runtime-logger.ts`
- [ ] T006 [P] 收敛 Feishu sender / adapter 边界到“主卡片 + 异常兜底消息”，并统一 delivery kind 映射在 `packages/channel-feishu/src/runtime-sender.ts`、`packages/channel-feishu/src/adapter.ts`

**检查点**: 基础能力就绪，可以并行推进各用户故事

---

## Phase 3：用户故事 1 - 运行中卡片输出（优先级：P1）🎯 MVP

**目标**: 让运行中卡片持续展示接近原始 agent 输出的内容，并尽可能保留标题、列表、强调、代码块、路径和命令等富文本语义

**独立验证方式**: 在飞书会话中发起一次普通请求，确认系统在真正开始执行后创建运行中卡片，并在过程中持续以富文本友好的方式更新卡片内容；排队请求在开始前不得提前创建卡片

### 用户故事 1 的测试 ⚠️

- [ ] T007 [P] [US1] 更新 bridge 与 presentation event 契约测试，约束 `agent.output.delta` 的顺序、结构恢复和队列门控语义在 `tests/contract/bridge-codex.contract.test.ts`、`tests/contract/presentation-events.contract.test.ts`
- [ ] T008 [P] [US1] 更新运行中卡片契约与集成测试，覆盖富文本输出窗口和排队不提前建卡在 `tests/contract/feishu-streaming-card.contract.test.ts`、`tests/integration/feishu-streaming-card.test.ts`、`tests/integration/feishu-queued-card-gating.test.ts`

### 用户故事 1 的实现

- [ ] T009 [P] [US1] 扩展 Codex bridge 输出事件，补充可用于富文本恢复的最小上下文信息在 `packages/bridge-codex/src/bridge.ts`、`packages/bridge-codex/src/cli-transport.ts`
- [ ] T010 [P] [US1] 重写输出窗口聚合逻辑，保留标题、列表、强调、代码块、路径和命令等结构片段在 `apps/gateway/src/services/run-output-window.ts`
- [ ] T011 [US1] 将富文本输出窗口接入运行中卡片编排与节流更新，在 `apps/gateway/src/services/presentation-orchestrator.ts`、`packages/channel-feishu/src/runtime-sender.ts`
- [ ] T012 [US1] 增加流式更新的运维可见性，记录 sequence 回退、清洗截断和节流行为在 `apps/gateway/src/services/run-notifier.ts`、`packages/core/src/observability/logger.ts`

**检查点**: 到这里，用户故事 1 应已完整可用并可独立验证

---

## Phase 4：用户故事 2 - 保留完成态摘要卡（优先级：P2）

**目标**: 让已送达的运行中卡片在完成、失败或取消时保留原消息并切换为终态富文本摘要卡

**独立验证方式**: 发起一次普通请求并等待其完成、失败或取消，确认原卡片停止流式更新后切换为终态卡片，不新增第二条成功终态消息

### 用户故事 2 的测试 ⚠️

- [ ] T013 [P] [US2] 更新终态卡片契约测试，覆盖 completed / failed / cancelled 同卡片终态切换在 `tests/contract/feishu-terminal-card.contract.test.ts`
- [ ] T014 [P] [US2] 更新终态卡片集成测试，覆盖成功完成和 `/abort` / 失败路径的同卡片终态表现在 `tests/integration/feishu-terminal-card.test.ts`、`tests/integration/local-runtime-failure-modes.test.ts`

### 用户故事 2 的实现

- [ ] T015 [P] [US2] 将终态内容渲染重构为结构化卡片文档，复用并收敛 `card-summary-renderer` / `terminal-result-renderer` 的职责在 `apps/gateway/src/services/card-summary-renderer.ts`、`apps/gateway/src/services/terminal-result-renderer.ts`
- [ ] T016 [US2] 更新编排器与通知器，使 completed / failed / cancelled 统一走“原卡片切换终态”流程在 `apps/gateway/src/services/presentation-orchestrator.ts`、`apps/gateway/src/services/run-notifier.ts`
- [ ] T017 [US2] 更新 Feishu sender 终态卡片 payload，确保终态卡片直接承载结论、主要变更、验证和下一步在 `packages/channel-feishu/src/runtime-sender.ts`、`packages/channel-feishu/src/adapter.ts`
- [ ] T018 [US2] 持久化终态卡片状态、关键摘要和最后输出摘录，确保 completed / failed / cancelled 都可审计在 `packages/core/src/storage/repositories.ts`

**检查点**: 到这里，用户故事 1 和 2 都应能独立运行与验证

---

## Phase 5：用户故事 3 - 单消息富文本终态（优先级：P3）

**目标**: 保证正常成功路径只有一条用户可见成功消息，并在卡片创建失败时才退化为单条终态富文本兜底消息

**独立验证方式**: 分别验证卡片创建成功和卡片创建失败两类路径；前者不得出现第二条成功终态消息，后者必须收到一条终态富文本兜底消息

### 用户故事 3 的测试 ⚠️

- [ ] T019 [P] [US3] 替换旧终态消息契约为 fallback-only terminal message 契约，并补齐 sender 单测在 `tests/contract/feishu-fallback-terminal.contract.test.ts`、`tests/unit/feishu-runtime-sender.test.ts`
- [ ] T020 [P] [US3] 更新降级集成测试，覆盖“卡片创建失败才 fallback”“卡片更新失败不得补发第二条成功消息”在 `tests/integration/feishu-presentation-degrade.test.ts`、`tests/integration/feishu-fallback-terminal.test.ts`

### 用户故事 3 的实现

- [ ] T021 [P] [US3] 将 `terminal-result-renderer` 收敛为 fallback-only terminal message 渲染器，并输出结构化富文本内容在 `apps/gateway/src/services/terminal-result-renderer.ts`、`packages/channel-feishu/src/runtime-sender.ts`
- [ ] T022 [US3] 在呈现编排中强制执行单消息约束，只允许“无已送达卡片”时进入 fallback 路径在 `apps/gateway/src/services/presentation-orchestrator.ts`、`packages/core/src/storage/repositories.ts`
- [ ] T023 [US3] 记录并暴露 fallback delivery、终态增强失败和 `singleMessageViolation` 状态在 `packages/core/src/observability/logger.ts`、`packages/core/src/storage/repositories.ts`、`apps/gateway/src/services/run-notifier.ts`

**检查点**: 到这里，所有用户故事都应可独立运行

---

## Phase 6：收尾与横切关注点

**目的**: 同步文档、验收脚本和最终验证结果

- [ ] T024 [P] 更新架构与协作文档，收口为“单消息富文本卡片 + fallback-only message”语义在 `docs/architecture.md`、`AGENTS.md`
- [ ] T025 [P] 更新人工验收与运维 runbook，覆盖 Peekaboo 验收、终态卡片观察点和降级判定在 `specs/003-feishu-cardkit-results/quickstart.md`
- [ ] T026 运行 `bun run lint`、`bun test`、`bunx tsc --noEmit`、`git diff --check -- .` 并把最终验证结论回写到 `specs/003-feishu-cardkit-results/quickstart.md`

---

## 依赖与执行顺序

### Phase Dependencies

- **Phase 1（初始化）**: 可立即开始
- **Phase 2（基础能力）**: 依赖 Phase 1 完成，并阻塞所有用户故事
- **Phase 3-5（用户故事）**: 都依赖 Phase 2 完成；可按优先级顺序推进，也可在团队足够时并行
- **Phase 6（收尾）**: 依赖需要交付的用户故事完成

### User Story Dependencies

- **US1（P1）**: 在 Phase 2 完成后即可开始，是 MVP
- **US2（P2）**: 依赖 US1 已具备运行中卡片与输出窗口能力
- **US3（P3）**: 依赖 US2 已具备同卡片终态切换能力，随后才能严谨约束 fallback-only 路径

### Within Each User Story

- 契约测试、集成测试必须先写并先失败
- 共享模型和持久化先于编排逻辑
- 渲染器和 sender 先于最终运行流集成
- 运维可见性必须和功能一起落地，不能事后补

### Parallel Opportunities

- T001 与 T002 可并行
- T004、T005、T006 在 T003 明确模型后可并行
- US1 中 T007、T008、T009、T010 可并行
- US2 中 T013、T014、T015 可并行
- US3 中 T019、T020、T021 可并行
- 收尾阶段 T024 与 T025 可并行

---

## Parallel Example：User Story 1

```bash
# 先并行补测试
Task: "更新 bridge 与 presentation event 契约测试在 tests/contract/bridge-codex.contract.test.ts、tests/contract/presentation-events.contract.test.ts"
Task: "更新运行中卡片契约与集成测试在 tests/contract/feishu-streaming-card.contract.test.ts、tests/integration/feishu-streaming-card.test.ts、tests/integration/feishu-queued-card-gating.test.ts"

# 再并行补实现骨架
Task: "扩展 Codex bridge 输出事件在 packages/bridge-codex/src/bridge.ts、packages/bridge-codex/src/cli-transport.ts"
Task: "重写输出窗口聚合逻辑在 apps/gateway/src/services/run-output-window.ts"
```

---

## 实施策略

### MVP First（仅 User Story 1）

1. 完成 Phase 1：初始化
2. 完成 Phase 2：基础能力
3. 完成 Phase 3：运行中卡片输出
4. 停下来执行独立验证，确认运行中富文本卡片和排队门控成立

### Incremental Delivery

1. Setup + Foundational 完成后先交付 US1，确保流式体验站稳
2. 在 US1 稳定后交付 US2，把终态结果收敛回同一张卡片
3. 最后交付 US3，严格收口单消息约束和 fallback-only 异常路径

### Parallel Team Strategy

1. 一名开发者推进 Phase 1-2 的共享模型、仓储和 sender 边界
2. Phase 2 完成后：
   - 开发者 A：US1 富文本流式输出
   - 开发者 B：US2 终态卡片切换
   - 开发者 C：US3 单消息约束与 fallback

---

## Notes

- [P] 任务表示不同文件、依赖可拆开的并行工作
- [US1] / [US2] / [US3] 保证任务能追溯到具体用户故事
- 任何涉及 Feishu adapter、Codex bridge、规范事件和运行生命周期的改动，都不能省略契约测试与集成测试
- 不要复活“正常路径额外发送第二条终态消息”的旧行为
