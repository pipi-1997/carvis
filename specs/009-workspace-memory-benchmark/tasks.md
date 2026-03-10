# 任务清单：Workspace Memory Benchmark

**输入**: `/specs/009-workspace-memory-benchmark/` 下的设计文档  
**前置条件**: plan.md（必需）、spec.md（用户故事必需）、research.md、data-model.md、contracts/

**测试要求**: 本功能触及受约束的运行生命周期观测与 operator-visible gate，必须包含 benchmark 输入/输出契约测试以及端到端集成测试。单元测试用于覆盖 domain model、fixture loader、scorer 和 gate evaluator。

**组织方式**: 任务按用户故事分组，以支持每个故事独立实现与独立验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., [US1], [US2], [US3])
- Include exact file paths in descriptions

## Phase 1：初始化（共享基础设施）

**目的**: 建立 benchmark 目录骨架和入口文件，为后续实现留出稳定位置。

- [X] T001 Create benchmark fixture directories under `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/fixtures/memory-benchmark/l1-golden`, `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/fixtures/memory-benchmark/l2-replay`, and `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/fixtures/memory-benchmark/l3-adversarial`
- [X] T002 Create benchmark support file stubs in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/support/memory-benchmark-fixtures.ts`, `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/support/memory-benchmark-trace.ts`, `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/support/memory-benchmark-score.ts`, `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/support/memory-benchmark-gates.ts`, and `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/support/memory-benchmark-runner.ts`

---

## Phase 2：基础能力（阻塞性前置条件）

**目的**: 建立所有用户故事都会复用的 benchmark 领域模型、输入输出契约和受控 trace 能力。

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Create benchmark domain models in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/packages/core/src/domain/memory-benchmark.ts` and export them from `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/packages/core/src/domain/index.ts` and `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/packages/core/src/index.ts`
- [X] T004 [P] Add unit coverage for benchmark domain models in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/unit/memory-benchmark-models.test.ts`
- [X] T005 [P] Add benchmark fixture contract coverage in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/contract/memory-benchmark-fixture.contract.test.ts`
- [X] T006 [P] Add benchmark report contract coverage in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/contract/memory-benchmark-report.contract.test.ts`
- [X] T007 Extend `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/support/harness.ts` to expose stable benchmark trace artifacts in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/support/memory-benchmark-trace.ts`, including `classification`, `writes`, `recalls`, `bridgeRequests`, `userVisibleOutputs`, `runtimeOutcome`, `signalSources`, raw token/latency hooks, and sync scan counters such as `filesScannedPerSync`
- [X] T008 [P] Add integration coverage for harness benchmark traces in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/integration/memory-benchmark-trace.test.ts`
- [X] T009 Implement fixture loading and validation in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/support/memory-benchmark-fixtures.ts`
- [X] T010 [P] Add unit coverage for fixture loading and validation in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/unit/memory-benchmark-fixtures.test.ts`

**检查点**: benchmark 领域模型、fixture 契约、report 契约和 harness trace 已就绪，可以开始按用户故事落 runner、语料和 gate。

---

## Phase 3：用户故事 1 - 运行 memory benchmark（优先级：P1）🎯 MVP

**目标**: 让维护者能够离线运行 benchmark，并得到 case 级、suite 级和全局级报告。

**独立验证方式**: 运行 benchmark 命令后，得到包含案例总数、失败案例、效果指标、成本指标和 gate 结果的结构化报告。

### 用户故事 1 的测试 ⚠️

- [X] T011 [P] [US1] Add contract test for benchmark runner report shape and cost metric fields in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/contract/memory-benchmark-runner.contract.test.ts`
- [X] T012 [P] [US1] Add integration test for end-to-end benchmark execution in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/integration/memory-benchmark.test.ts`

### 用户故事 1 的实现

- [X] T013 [P] [US1] Seed minimal golden fixtures in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/fixtures/memory-benchmark/l1-golden/remember-bun.json` and `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/fixtures/memory-benchmark/l1-golden/not-memory-chat.json`
- [X] T014 [P] [US1] Implement case scoring logic in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/support/memory-benchmark-score.ts`
- [X] T015 [P] [US1] Implement default Gate Profile and gate evaluation logic in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/support/memory-benchmark-gates.ts`
- [X] T016 [US1] Implement suite runner and aggregate reporting in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/support/memory-benchmark-runner.ts`, including P50/P95 aggregation for cost metrics, `filesScannedPerSync` aggregation, and trace summaries required by the report contract
- [X] T017 [US1] Add developer-facing local benchmark scripts such as `test:memory-benchmark` to `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/package.json`
- [X] T018 [US1] Add unit coverage for scoring, default gate profile, cost metric aggregation, and sync scan metric aggregation in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/unit/memory-benchmark-score.test.ts` and `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/unit/memory-benchmark-gates.test.ts`

**检查点**: 到这里，维护者已经可以运行离线 benchmark，并查看最小可用的报告和 gate 结果。这是 MVP。

---

## Phase 4：用户故事 2 - 回归 memory 场景（优先级：P2）

**目标**: 把显式写入、自然语言意图、旧事实覆盖和 `/new` 后 recall 等关键场景纳入同一套可回归样例。

**独立验证方式**: 新增或修改样例后，运行 benchmark 能在报告中准确区分 remember、forget、update、not_memory、stale recall 和 durable recall 命中结果。

### 用户故事 2 的测试 ⚠️

- [X] T019 [P] [US2] Add integration test for golden memory scenarios in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/integration/memory-benchmark-golden-scenarios.test.ts`
- [X] T020 [P] [US2] Add integration test for replay and adversarial suites in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/integration/memory-benchmark-suite-coverage.test.ts`

### 用户故事 2 的实现

- [X] T021 [P] [US2] Add natural-language remember/update golden fixtures in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/fixtures/memory-benchmark/l1-golden/natural-language-remember.json` and `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/fixtures/memory-benchmark/l1-golden/update-supersedes-old-fact.json`
- [X] T022 [P] [US2] Add `/new`-after-recall replay fixture in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/fixtures/memory-benchmark/l2-replay/continued-after-new.json`
- [X] T023 [P] [US2] Add adversarial fixtures for noisy chat and stale recall in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/fixtures/memory-benchmark/l3-adversarial/noisy-chat-not-memory.json` and `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/fixtures/memory-benchmark/l3-adversarial/superseded-fact-not-recalled.json`
- [X] T024 [US2] Extend `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/support/memory-benchmark-runner.ts` to run all suites and aggregate per-suite metrics
- [X] T025 [US2] Extend `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/support/memory-benchmark-score.ts` to score false writes, stale recall and missed durable recall against fixture expectations

**检查点**: 到这里，回归语料已经覆盖关键 memory 行为，开发者可通过 suite 结果快速定位 recall 和分类回归。

---

## Phase 5：用户故事 3 - 基于 gate 决定 rollout（优先级：P3）

**目标**: 让 feature owner 和 operator 能根据 benchmark 报告判断记忆能力应继续实验、只开 shadow/灰度，还是可以进入下一阶段。

**独立验证方式**: benchmark 报告给出明确的 gate 结论、阻断原因和 rollout recommendation。

### 用户故事 3 的测试 ⚠️

- [X] T026 [P] [US3] Add contract test for rollout recommendation states in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/contract/memory-benchmark-gate.contract.test.ts`
- [X] T027 [P] [US3] Add integration test for blocked versus eligible rollout decisions in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/integration/memory-benchmark-gate.test.ts`

### 用户故事 3 的实现

- [X] T028 [P] [US3] Implement rollout recommendation mapping in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/support/memory-benchmark-gates.ts`
- [X] T029 [US3] Extend `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/tests/support/memory-benchmark-runner.ts` to emit operator-facing gate summaries and failure reasons
- [X] T030 [US3] Add benchmark ops guidance and explicit test-double versus runtime-reuse boundary notes to `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/specs/009-workspace-memory-benchmark/quickstart.md`

**检查点**: 到这里，benchmark 不只是测试工具，而是 rollout 决策工具。

---

## Phase 6：收尾与横切关注点

**目的**: 收敛脚本、文档和全量回归，确保 benchmark 可持续维护。

- [X] T031 [P] Add CI-facing benchmark verification command wiring such as `test:memory-benchmark:gate` in `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/package.json`
- [X] T032 [P] Update `/Users/pipi/workspace/carvis/.worktrees/009-workspace-memory-benchmark/specs/009-workspace-memory-benchmark/quickstart.md` with final run commands and expected outputs
- [X] T033 Run full benchmark verification with `bun test tests/unit/memory-benchmark-models.test.ts`, `bun test tests/unit/memory-benchmark-fixtures.test.ts`, `bun test tests/unit/memory-benchmark-score.test.ts`, `bun test tests/unit/memory-benchmark-gates.test.ts`, `bun test tests/integration/memory-benchmark-trace.test.ts`, `bun test tests/integration/memory-benchmark.test.ts`, `bun test tests/integration/memory-benchmark-golden-scenarios.test.ts`, `bun test tests/integration/memory-benchmark-suite-coverage.test.ts`, `bun test tests/integration/memory-benchmark-gate.test.ts`, `bun run test:memory-benchmark`, and `bun run lint`

---

## 依赖与执行顺序

### Phase Dependencies

- **Phase 1**: 可立即开始
- **Phase 2**: 依赖 Phase 1 完成；阻塞所有用户故事
- **Phase 3 (US1)**: 依赖 Phase 2 完成，是 MVP
- **Phase 4 (US2)**: 依赖 US1 的 runner、scorer 和最小 fixtures 已可用
- **Phase 5 (US3)**: 依赖 US1 的 aggregate report 和 US2 的 suite metrics 已可用
- **Phase 6**: 依赖所有目标用户故事完成

### User Story Dependencies

- **US1 (P1)**: 只依赖基础能力，完成后即可独立演示 benchmark MVP
- **US2 (P2)**: 依赖 US1 的 runner/report 基础，但可独立验证回归语料和判分扩展
- **US3 (P3)**: 依赖 US1/US2 的指标产出，独立验证 rollout gate 与 recommendation

### Within Each User Story

- 契约测试和集成测试先写并确保失败
- fixture / domain / trace 基础先于 runner 聚合逻辑
- scorer 先于 gate
- gate 先于 rollout recommendation

### Parallel Opportunities

- Phase 2 中 `T004`、`T005`、`T006`、`T008`、`T010` 可并行
- US1 中 `T013`、`T014`、`T015` 可并行
- US2 中 `T019`、`T020`、`T021`、`T022`、`T023` 可并行
- US3 中 `T026`、`T027`、`T028` 可并行

---

## Parallel Example: User Story 1

```bash
# 并行准备 US1 的基础输入与判分逻辑
Task: "Seed minimal golden fixtures in tests/fixtures/memory-benchmark/l1-golden/remember-bun.json and tests/fixtures/memory-benchmark/l1-golden/not-memory-chat.json"
Task: "Implement case scoring logic in tests/support/memory-benchmark-score.ts"
Task: "Implement gate evaluation logic in tests/support/memory-benchmark-gates.ts"
```

---

## 实施策略

### MVP First (User Story 1 Only)

1. 完成 Phase 1：初始化
2. 完成 Phase 2：基础能力
3. 完成 Phase 3：US1
4. **STOP and VALIDATE**：确认 benchmark MVP 已能输出可读的报告和 gate 结果

### Incremental Delivery

1. Setup + Foundational 完成后先交付 US1
2. 用 US2 扩充真实回归覆盖
3. 用 US3 把 benchmark 接到 rollout gate

### Parallel Team Strategy

1. 一人完成 Phase 1-2
2. 之后可拆分：
   - 开发者 A：US1 runner/report
   - 开发者 B：US2 fixture corpus 和 scoring 扩展
   - 开发者 C：US3 gate recommendation 和 operator-facing summary

---

## Notes

- [P] 任务表示不同文件、可并行执行
- [US1]/[US2]/[US3] 用于追踪任务与用户故事的映射
- 每个用户故事都必须能独立验证
- benchmark 是 rollout gate，不替代现有 contract/integration 测试
