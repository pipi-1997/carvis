---

description: "Task list template for feature implementation"
---

# 任务清单：[FEATURE NAME]

**输入**: `/specs/[###-feature-name]/` 下的设计文档
**前置条件**: plan.md（必需）、spec.md（用户故事必需）、research.md、data-model.md、contracts/

**测试要求**: 只要故事涉及适配器、桥接器、规范事件、排队、投递、调度/webhook 流程
或运行生命周期语义，就必须包含契约测试与集成测试。单元测试除非规格显式要求或实现逻辑
需要，否则可选。

**组织方式**: 任务按用户故事分组，以支持每个故事独立实现与独立验证。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Gateway app**: `apps/gateway/src/`
- **Executor app**: `apps/executor/src/`
- **Shared packages**: `packages/<name>/src/`
- **Tests**: `tests/contract/`, `tests/integration/`, `tests/unit/`
- Adjust file paths to the structure selected in `plan.md`

<!-- 
  ============================================================================
  IMPORTANT: The tasks below are SAMPLE TASKS for illustration purposes only.
  
  The /speckit.tasks command MUST replace these with actual tasks based on:
  - User stories from spec.md (with their priorities P1, P2, P3...)
  - Feature requirements from plan.md
  - Entities from data-model.md
  - Endpoints from contracts/
  
  Tasks MUST be organized by user story so each story can be:
  - Implemented independently
  - Tested independently
  - Delivered as an MVP increment
  
  DO NOT keep these sample tasks in the generated tasks.md file.
  ============================================================================
-->

## Phase 1：初始化（共享基础设施）

**目的**: 完成项目初始化与基础结构搭建

- [ ] T001 Create project structure per implementation plan
- [ ] T002 Initialize [language] project with [framework] dependencies
- [ ] T003 [P] Configure linting and formatting tools
- [ ] T004 Establish shared canonical types and package boundaries in [path]

---

## Phase 2：基础能力（阻塞性前置条件）

**目的**: 在实现任何用户故事前必须完成的核心基础设施

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

Examples of foundational tasks (adjust based on your project):

- [ ] T005 Setup database schema and migrations framework
- [ ] T006 [P] Implement queue, lock, cancel, timeout, and heartbeat primitives in [path]
- [ ] T007 [P] Setup webhook ingress / routing / adapter registration in [path]
- [ ] T008 Create base models/entities that all stories depend on
- [ ] T009 Configure structured logging, audit logging, and delivery status infrastructure
- [ ] T010 Setup environment and secret configuration management

**检查点**: 基础能力就绪，可以并行推进各用户故事

---

## Phase 3：用户故事 1 - [标题]（优先级：P1）🎯 MVP

**目标**: [简要描述该故事交付什么价值]

**独立验证方式**: [如何独立验证该故事]

### 用户故事 1 的测试（触及受约束边界时必填）⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**
> Contract and integration tests are mandatory if this story changes governed seams.

- [ ] T011 [P] [US1] Contract test for [adapter/bridge/interface] in tests/contract/[path]
- [ ] T012 [P] [US1] Integration test for [user journey or run flow] in tests/integration/[path]

### 用户故事 1 的实现

- [ ] T013 [P] [US1] Create or update [Entity1] in [path]
- [ ] T014 [P] [US1] Create or update [Entity2] in [path]
- [ ] T015 [US1] Implement [service / adapter / bridge] in [path] (depends on T013, T014)
- [ ] T016 [US1] Implement [endpoint / command / UI / worker flow] in [path]
- [ ] T017 [US1] Add validation, timeout, and failure handling in [path]
- [ ] T018 [US1] Add structured logging, admin visibility, and notification hooks in [path]

**检查点**: 到这里，用户故事 1 应已完整可用并可独立验证

---

## Phase 4：用户故事 2 - [标题]（优先级：P2）

**目标**: [简要描述该故事交付什么价值]

**独立验证方式**: [如何独立验证该故事]

### 用户故事 2 的测试（触及受约束边界时必填）⚠️

- [ ] T019 [P] [US2] Contract test for [adapter/bridge/interface] in tests/contract/[path]
- [ ] T020 [P] [US2] Integration test for [user journey or run flow] in tests/integration/[path]

### 用户故事 2 的实现

- [ ] T021 [P] [US2] Create or update [Entity] in [path]
- [ ] T022 [US2] Implement [Service] in [path]
- [ ] T023 [US2] Implement [endpoint/feature] in [path]
- [ ] T024 [US2] Integrate with User Story 1 components and operator workflows in [path] (if needed)

**检查点**: 到这里，用户故事 1 和 2 都应能独立运行与验证

---

## Phase 5：用户故事 3 - [标题]（优先级：P3）

**目标**: [简要描述该故事交付什么价值]

**独立验证方式**: [如何独立验证该故事]

### 用户故事 3 的测试（触及受约束边界时必填）⚠️

- [ ] T025 [P] [US3] Contract test for [adapter/bridge/interface] in tests/contract/[path]
- [ ] T026 [P] [US3] Integration test for [user journey or run flow] in tests/integration/[path]

### 用户故事 3 的实现

- [ ] T027 [P] [US3] Create or update [Entity] in [path]
- [ ] T028 [US3] Implement [Service] in [path]
- [ ] T029 [US3] Implement [endpoint/feature] in [path]

**检查点**: 到这里，所有用户故事都应可独立运行

---

[Add more user story phases as needed, following the same pattern]

---

## Phase N：收尾与横切关注点

**目的**: 处理跨多个用户故事的改进项

- [ ] TXXX [P] Documentation updates in docs/
- [ ] TXXX Code cleanup and refactoring
- [ ] TXXX Performance optimization across all stories
- [ ] TXXX [P] Additional unit tests (if requested) in tests/unit/
- [ ] TXXX [P] Runbook / admin documentation updates for operator-facing changes
- [ ] TXXX Security hardening
- [ ] TXXX Run quickstart.md validation

---

## 依赖与执行顺序

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - May integrate with US1 but should be independently testable
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - May integrate with US1/US2 but should be independently testable

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Constitution-mandated contract and integration tests cannot be omitted for governed seams
- Models before services
- Services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- Models within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together (if tests requested):
Task: "Contract test for [adapter/bridge/interface] in tests/contract/[path]"
Task: "Integration test for [user journey or run flow] in tests/integration/[path]"

# Launch all models for User Story 1 together:
Task: "Create or update [Entity1] in [path]"
Task: "Create or update [Entity2] in [path]"
```

---

## 实施策略

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Include observability and operator-facing tasks whenever a story changes execution flow
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
