# 任务清单：Workspace Durable Memory MVP

**输入**: `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/specs/010-workspace-durable-memory-mvp/` 下的设计文档  
**前置条件**: plan.md（必需）、spec.md（用户故事必需）、research.md、data-model.md、contracts/

**测试要求**: 本功能触及 executor preflight、bridge prompt augmentation、workspace 文件持久化、compaction path 和 benchmark gate，必须包含契约测试与集成测试。单元测试用于覆盖 memory path、excerpt 裁剪、daily memory 选择、文件 diff 和 flush 规则。

**组织方式**: 任务按用户故事分组，以支持每个故事独立实现与独立验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. [US1], [US2], [US3], [US4], [US5])
- Include exact file paths in descriptions

## Phase 1：初始化（共享基础设施）

**目的**: 建立 workspace durable memory 的代码落点、fixtures 和测试入口。

- [X] T001 Create workspace memory service stubs in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/apps/executor/src/services/workspace-memory.ts`, `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/apps/executor/src/services/workspace-memory-guidance.ts`, and `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/apps/executor/src/services/workspace-memory-flush.ts`
- [X] T002 Create fixtures under `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/fixtures/workspace-memory/` for empty memory, curated memory, today/yesterday daily memory, long session flush, and manual edit scenarios

---

## Phase 2：基础能力（阻塞性前置条件）

**目的**: 建立所有用户故事共享的 memory path、excerpt、diff、flush 和 trace 基础。

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 Implement workspace memory path, file load, create-if-missing, today/yesterday daily selection, excerpt clipping, and file diff helpers in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/apps/executor/src/services/workspace-memory.ts`
- [X] T004 [P] Add unit coverage for excerpt budget, file selection, and file diff behavior in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/unit/workspace-memory.test.ts`
- [X] T005 Implement memory flush trigger helpers and result model in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/apps/executor/src/services/workspace-memory-flush.ts`
- [X] T006 [P] Add unit coverage for flush eligibility and silent-output guarantees in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/unit/workspace-memory-flush.test.ts`
- [X] T007 Extend benchmark trace types and helpers for `MEMORY.md` diff, daily memory diff, prompt augmentation, and flush observations in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/support/memory-benchmark-trace.ts` and `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/packages/core/src/domain/memory-benchmark.ts`
- [X] T008 [P] Add contract coverage for memory benchmark runtime trace fields and tool-count sourcing in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/contract/workspace-memory-benchmark-runtime.contract.test.ts`
- [X] T009 Extend `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/support/harness.ts` to snapshot memory files before/after runs and derive memory-related metrics from bridge/tool instrumentation
- [X] T010 [P] Add integration coverage for harness memory trace capture in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/integration/workspace-memory-trace.test.ts`
- [X] T011 [P] Add contract coverage that memory integration does not change workspace queue/lock/cancel/timeout semantics in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/contract/workspace-memory-run-lifecycle.contract.test.ts`
- [X] T012 [P] Add integration coverage that heartbeat loss, run failure, and timeout still surface operator-visible memory outcomes in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/integration/workspace-memory-run-failure-visibility.test.ts`
- [X] T013 [P] Add contract coverage that MVP does not introduce memory index, tool-first retrieval, or independent memory worker surfaces in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/contract/workspace-memory-scope-guard.contract.test.ts`

**检查点**: 到这里，真实读写、真实 recall 和真实 flush 的基础观测都已就绪。

---

## Phase 3：用户故事 1 - Agent 在正常 run 中形成 durable memory（优先级：P1）🎯 MVP

**目标**: 让普通 run 在 guidance 约束下真实改写 `.carvis/MEMORY.md`。

**独立验证方式**: 正常对话形成长期偏好或项目约定后，run 结束时 `.carvis/MEMORY.md` 真实变化且回复与变更一致。

### 用户故事 1 的测试 ⚠️

- [X] T014 [P] [US1] Add contract coverage for memory guidance injection in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/contract/workspace-memory-guidance.contract.test.ts`
- [X] T015 [P] [US1] Add integration coverage for long-term facts being written to `.carvis/MEMORY.md` during normal runs in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/integration/workspace-memory-long-term-write.test.ts`
- [X] T016 [P] [US1] Add integration coverage for superseding conflicting long-term facts in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/integration/workspace-memory-supersede.test.ts`
- [X] T017 [P] [US1] Add integration coverage that transient or unstable chat content does not create durable writes in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/integration/workspace-memory-no-false-write.test.ts`
- [X] T018 [P] [US1] Add integration coverage for recent-context notes being written to daily memory during normal runs in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/integration/workspace-memory-daily-write.test.ts`

### 用户故事 1 的实现

- [X] T019 [P] [US1] Implement memory guidance rules for long-term facts, recent-context daily writes, de-duplication, and reject-write cases in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/apps/executor/src/services/workspace-memory-guidance.ts`
- [X] T020 [US1] Inject memory guidance into `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/apps/executor/src/run-controller.ts` before `bridge.startRun`
- [X] T021 [US1] Record `MEMORY.md` and daily-memory write observations plus operator-facing log fields in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/apps/executor/src/run-controller.ts` and `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/packages/core/src/observability/runtime-logger.ts`

**检查点**: 到这里，正常 run 已经形成真实长期记忆闭环。

---

## Phase 4：用户故事 2 - 普通 run 自动读取 workspace memory（优先级：P1）

**目标**: 在普通 run 调用 bridge 前注入 bounded memory excerpt，并在 `/new` 或跨 chat 时保持 workspace 级持久记忆。

**独立验证方式**: 某个 workspace 形成 memory 后，下一次普通 run 的 bridge request 中包含 bounded memory excerpt；`/new` 后和跨 chat 仍能命中。

### 用户故事 2 的测试 ⚠️

- [X] T022 [P] [US2] Add integration coverage for preflight recall augmentation from `MEMORY.md` in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/integration/workspace-memory-recall.test.ts`
- [X] T023 [P] [US2] Add integration coverage for today/yesterday daily memory inclusion in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/integration/workspace-memory-daily-recall.test.ts`
- [X] T024 [P] [US2] Add integration coverage for `/new` after recall and cross-chat shared workspace behavior in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/integration/workspace-memory-recall-after-new.test.ts`

### 用户故事 2 的实现

- [X] T025 [P] [US2] Implement bounded excerpt selection, source prioritization, and token budget accounting in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/apps/executor/src/services/workspace-memory.ts`
- [X] T026 [US2] Inject memory excerpt into bridge requests in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/apps/executor/src/run-controller.ts`
- [X] T027 [US2] Capture preflight latency, files scanned, and memory-related tool counts in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/support/harness.ts`

**检查点**: 到这里，workspace durable memory 已在普通 run 中真实生效。

---

## Phase 5：用户故事 3 - 接近 compaction 时保住可持久化信息（优先级：P2）

**目标**: 在接近 compaction 时触发静默 memory flush，把应保留的信息写入当天 daily memory。

**独立验证方式**: 构造长会话，检查 compaction 前触发 flush，且不产生额外用户可见消息。

### 用户故事 3 的测试 ⚠️

- [X] T028 [P] [US3] Add integration coverage for pre-compaction memory flush in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/integration/workspace-memory-flush.test.ts`
- [X] T029 [P] [US3] Add integration coverage that flush remains silent to users in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/integration/workspace-memory-flush-silent.test.ts`
- [X] T030 [P] [US3] Add contract coverage for flush trace fields and operator-visible outcomes in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/contract/workspace-memory-flush.contract.test.ts`

### 用户故事 3 的实现

- [X] T031 [P] [US3] Implement flush trigger evaluation and target-path resolution in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/apps/executor/src/services/workspace-memory-flush.ts`
- [X] T032 [US3] Wire silent flush execution and observation capture into `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/apps/executor/src/run-controller.ts`
- [X] T033 [US3] Record flush-specific operator logs in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/packages/core/src/observability/runtime-logger.ts`

**检查点**: 到这里，记忆读写闭环已覆盖长会话 compaction 场景。

---

## Phase 6：用户故事 4 - 手工编辑 memory 文件后无需 sync 即可生效（优先级：P2）

**目标**: 确保 memory 文件是唯一真相源，人工修改后下一次 run 直接生效。

**独立验证方式**: 手工修改 fixture 或 workspace 中的 memory 文件后，下一次普通 run 读取新内容，且 augmentation 与文件新状态一致。

### 用户故事 4 的测试 ⚠️

- [X] T034 [P] [US4] Add integration coverage for manual `MEMORY.md` edits taking effect without sync in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/integration/workspace-memory-manual-edit.test.ts`
- [X] T035 [P] [US4] Add integration coverage for manual daily memory edits taking effect without sync in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/integration/workspace-memory-manual-daily-edit.test.ts`
- [X] T036 [P] [US4] Add contract coverage for file-first durable truth semantics and `/memory sync` remaining unsupported in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/contract/workspace-memory-file-truth.contract.test.ts`

### 用户故事 4 的实现

- [X] T037 [P] [US4] Ensure recall always reloads workspace memory files from filesystem instead of stale cache in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/apps/executor/src/services/workspace-memory.ts`
- [X] T038 [US4] Extend trace capture to distinguish manual file edits from run-driven writes in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/support/memory-benchmark-trace.ts` and `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/support/harness.ts`

**检查点**: 到这里，file-first truth 已成立，不依赖额外 sync 子系统。

---

## Phase 7：用户故事 5 - 用 benchmark 验证方案可落地（优先级：P3）

**目标**: 让 `009-workspace-memory-benchmark` 基于真实文件读写、真实 augmentation 和真实 flush 判断该方案是否可 rollout。

**独立验证方式**: 运行 benchmark 后，结果反映真实 `MEMORY.md`/daily memory diff、真实 recall 命中和真实热路径成本。

### 用户故事 5 的测试 ⚠️

- [X] T039 [P] [US5] Add integration coverage for real runtime benchmark gate in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/integration/workspace-memory-benchmark-gate.test.ts`
- [X] T040 [P] [US5] Add contract coverage for benchmark rollout evidence in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/contract/workspace-memory-benchmark-report.contract.test.ts`
- [X] T041 [P] [US5] Add integration coverage for operator-visible distinction between no file change, no-op, run failure, run timeout, heartbeat loss, flush miss, recall miss, and benchmark blocked in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/integration/workspace-memory-operator-visibility.test.ts`

### 用户故事 5 的实现

- [X] T042 [P] [US5] Update `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/support/memory-benchmark-runner.ts` to score real workspace memory runtime behavior instead of placeholders
- [X] T043 [US5] Update benchmark fixtures and expectations in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/tests/fixtures/memory-benchmark/` for long-term write, daily write, daily recall, repeated recall, and flush scenarios
- [X] T044 [US5] Wire benchmark verification guidance into `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/specs/010-workspace-durable-memory-mvp/quickstart.md`

**检查点**: 到这里，`0010` 是否可上线由 benchmark 客观决定，而不是主观判断。

---

## Phase 8：收尾与横切关注点

**目的**: 完成全量验证，收口文档与实现边界。

- [X] T045 [P] Update operator-facing docs in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/specs/010-workspace-durable-memory-mvp/contracts/workspace-memory-commands.md` and `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp/specs/010-workspace-durable-memory-mvp/quickstart.md`
- [X] T046 Run final verification with `bun test`, `bun run lint`, and `bun run test:memory-benchmark` in `/Users/pipi/workspace/carvis/.worktrees/010-workspace-durable-memory-mvp`

---

## 依赖与执行顺序

### Phase Dependencies

- **Phase 1**: 可立即开始
- **Phase 2**: 依赖 Phase 1 完成；阻塞所有用户故事
- **Phase 3 (US1)**: 依赖 Phase 2 完成，是 MVP 起点
- **Phase 4 (US2)**: 依赖 US1 的长期记忆与 normal-run daily memory 已可用
- **Phase 5 (US3)**: 依赖 US2 的 recall 管道已可用
- **Phase 6 (US4)**: 依赖 US2 的 recall 管道
- **Phase 7 (US5)**: 依赖 US1-US4 的真实 runtime
- **Phase 8**: 依赖所有目标用户故事完成

### User Story Dependencies

- **US1 (P1)**: 完成后即可独立验证“正常 run 能真实形成长期记忆和 daily memory”
- **US2 (P1)**: 依赖 US1 的 durable 内容存在，但可独立验证 recall
- **US3 (P2)**: 依赖 US2 的 recall 管道，独立验证 flush
- **US4 (P2)**: 依赖 US2 的 recall 管道，独立验证 file-first truth
- **US5 (P3)**: 依赖 US1-US4 的真实 runtime，负责 rollout gate 和 operator 可见性

### Within Each User Story

- 契约测试和集成测试先写并确保失败
- memory service / diff helper 先于 run-controller 接线
- recall 与 flush trace 捕获先于 benchmark scorer
- benchmark gate 最后接入，不允许先伪造 green

### Parallel Opportunities

- Phase 2 中 `T004`、`T006`、`T008`、`T010`、`T011`、`T012`、`T013` 可并行
- US1 中 `T014`、`T015`、`T016`、`T017`、`T018`、`T019` 可并行
- US2 中 `T022`、`T023`、`T024`、`T025` 可并行
- US3 中 `T028`、`T029`、`T030`、`T031` 可并行
- US4 中 `T034`、`T035`、`T036`、`T037` 可并行
- US5 中 `T039`、`T040`、`T041`、`T043` 可并行

---

## 实施策略

### MVP First (User Story 1 + User Story 2)

1. 完成 Phase 1：初始化
2. 完成 Phase 2：基础能力
3. 完成 Phase 3：US1
4. 完成 Phase 4：US2
5. **STOP and VALIDATE**：确认正常 run 已能真实形成长期记忆，并在后续普通 run 中稳定 recall

### Incremental Delivery

1. Setup + Foundational 完成后先交付 US1 + US2
2. 用 US3 补齐长会话 flush 闭环
3. 用 US4 确认 file-first truth，不引入 sync
4. 用 US5 把 benchmark 接成正式验收门禁

### Parallel Team Strategy

1. 一人完成 Phase 1-2
2. 之后可以拆分：
   - 开发者 A：US1 guidance 与长期记忆写入观测
   - 开发者 B：US2 preflight recall 与 augmentation
   - 开发者 C：US3 flush
   - 开发者 D：US4 manual edit / file truth
   - 开发者 E：US5 benchmark runtime / gate

---

## Notes

- [P] 任务表示不同文件、可并行执行
- `0010` 明确不做 memory index / tool-first retrieval / 独立 memory model
- `009-workspace-memory-benchmark` 是硬门槛，不允许通过修改阈值获得伪通过
