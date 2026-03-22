# Schedule Enable And Structured List Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 schedule 管理补齐显式 `enable` 动作、结构化 `list` 结果、以及更严格的 CLI 校验与帮助输出，同时修复现有 CLI 单测的环境敏感问题。

**Architecture:** 继续沿用现有 `CLI -> gateway service -> override/effective model` 架构，不新增旁路状态机。`enable` 与 `disable` 对称地写入 `TriggerDefinitionOverride.enabled`；`list` 在保留 `summary` 兼容层的前提下新增结构化 `schedules` 数组；CLI 校验收敛在 `packages/carvis-schedule-cli`，gateway 契约收敛在 `packages/core` 与 `apps/gateway`。

**Tech Stack:** Bun 1.3.9, TypeScript 5.9.x, Hono, PostgreSQL repository abstractions, Bun test

---

### Task 1: Freeze Desired Contract In Tests

**Files:**
- Modify: `tests/unit/carvis-schedule-cli.test.ts`
- Modify: `tests/unit/schedule-management-service.test.ts`
- Modify: `tests/unit/run-tool-router.test.ts`
- Modify: `tests/contract/carvis-schedule-cli.contract.test.ts`
- Modify: `tests/contract/schedule-management-list.contract.test.ts`
- Create or Modify: `tests/contract/schedule-management-enable.contract.test.ts`

**Step 1: Write failing tests for `enable` and structured `list`**

- Add parser expectations for `enable`.
- Add CLI contract coverage for `enable` exit code and JSON payload.
- Add service/router coverage for `enable`.
- Add `list` assertions for `schedules[]` while keeping `summary`.

**Step 2: Run tests to verify they fail**

Run:

```bash
bun test tests/unit/carvis-schedule-cli.test.ts tests/unit/schedule-management-service.test.ts tests/unit/run-tool-router.test.ts tests/contract/carvis-schedule-cli.contract.test.ts tests/contract/schedule-management-list.contract.test.ts tests/contract/schedule-management-enable.contract.test.ts
```

Expected:
- `enable` tests fail because action/tool do not exist yet
- `list` structure assertions fail because `schedules` is absent

### Task 2: Extend Shared Schedule Contract

**Files:**
- Modify: `packages/core/src/domain/models.ts`

**Step 1: Add shared types**

- Extend `ScheduleManagementActionType` with `enable`
- Add `ManagedScheduleSummary` shape for structured `list`
- Extend `ScheduleToolResult` with optional `schedules`

**Step 2: Re-run focused type/test checks**

Run:

```bash
bun test tests/unit/schedule-management-service.test.ts tests/contract/schedule-management-list.contract.test.ts
```

Expected:
- type-aware failures move to gateway/CLI implementation paths

### Task 3: Implement Gateway `enable` And Structured `list`

**Files:**
- Modify: `apps/gateway/src/services/schedule-management-service.ts`
- Modify: `apps/gateway/src/services/run-tool-router.ts`

**Step 1: Implement minimal gateway behavior**

- Add `enable` flow mirroring `disable`
- Make `update` preserve current `enabled` state instead of forcing `true`
- Return `schedules[]` from `list`

**Step 2: Run gateway-focused tests**

Run:

```bash
bun test tests/unit/schedule-management-service.test.ts tests/unit/run-tool-router.test.ts tests/contract/schedule-management-list.contract.test.ts tests/contract/schedule-management-enable.contract.test.ts
```

Expected:
- gateway unit/contract tests pass

### Task 4: Implement CLI Parser, Help, And Validation

**Files:**
- Modify: `packages/carvis-schedule-cli/src/command-parser.ts`
- Modify: `packages/carvis-schedule-cli/src/index.ts`

**Step 1: Implement minimal CLI changes**

- Accept `enable`
- Validate `--delivery-kind`
- Expand help output with supported flags
- Keep stdout JSON contract backward-compatible

**Step 2: Fix environment-sensitive CLI tests**

- Make tests pass explicit `env` where needed, or isolate parser inputs from host env leakage

**Step 3: Run CLI tests**

Run:

```bash
bun test tests/unit/carvis-schedule-cli.test.ts tests/contract/carvis-schedule-cli.contract.test.ts
```

Expected:
- all CLI tests pass without relying on host shell env

### Task 5: Add Spec/Release Surface Updates

**Files:**
- Modify: `specs/007-agent-managed-scheduling/spec.md`
- Modify: `specs/007-agent-managed-scheduling/contracts/schedule-management-service.md`
- Modify: `specs/007-agent-managed-scheduling/contracts/schedule-management-tools.md`
- Create: `.changeset/<generated>.md`

**Step 1: Update spec artifacts**

- Document `enable`
- Document structured `list`
- Document `update` no longer implicitly re-enables disabled schedules

**Step 2: Add release note**

- Create a changeset for any publishable package changes

### Task 6: Verify End To End

**Files:**
- No additional source files unless verification reveals defects

**Step 1: Run full focused verification**

Run:

```bash
bun test tests/unit/carvis-schedule-cli.test.ts tests/unit/schedule-management-service.test.ts tests/unit/run-tool-router.test.ts tests/contract/carvis-schedule-cli.contract.test.ts tests/contract/schedule-management-list.contract.test.ts tests/contract/schedule-management-update.contract.test.ts tests/contract/schedule-management-disable.contract.test.ts tests/contract/schedule-management-enable.contract.test.ts
```

**Step 2: Run repo typecheck**

Run:

```bash
bun run lint
```

Expected:
- targeted tests pass
- typecheck passes
