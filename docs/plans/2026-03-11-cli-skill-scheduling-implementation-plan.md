# CLI + Skill Scheduling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 007 的 schedule 管理执行面从 external MCP 切换为本地 `carvis-schedule` CLI + skill。

**Architecture:** 新增一个本地 CLI 包，作为 gateway 内部 schedule management route 的 shell facade；新增一个 skill 包，指导 agent 使用 CLI。`packages/bridge-codex` 去掉 external MCP 依赖与 probe，改为 CLI readiness 检查和 shell 调用可达性保证。

**Tech Stack:** Bun 1.x、TypeScript 5.x、Codex CLI、workspace packages、Hono、Postgres、Redis

---

### Task 1: Rewrite spec artifacts to CLI-first

**Files:**
- Modify: `specs/007-agent-managed-scheduling/spec.md`
- Modify: `specs/007-agent-managed-scheduling/plan.md`
- Modify: `specs/007-agent-managed-scheduling/tasks.md`
- Modify: `docs/architecture.md`
- Modify: `docs/runbooks/schedule-management.md`

**Step 1: Write the failing expectation**

Mark any remaining `MCP`-first behavior as outdated.

**Step 2: Run check**

Run: `rg -n "MCP|mcp_servers|external MCP" specs/007-agent-managed-scheduling docs`

Expected: legacy wording still exists.

**Step 3: Update docs**

Replace external MCP execution path with CLI + skill path while preserving gateway-owned durable boundaries.

**Step 4: Verify**

Run: `rg -n "carvis-schedule|CLI|skill" specs/007-agent-managed-scheduling docs`

Expected: docs consistently describe CLI-first execution.

### Task 2: Add failing CLI contract tests

**Files:**
- Create: `tests/unit/carvis-schedule-cli.test.ts`
- Create: `tests/contract/carvis-schedule-cli.contract.test.ts`

**Step 1: Write the failing tests**

Cover:
- create/list/update/disable command parsing
- JSON stdout contract
- exit codes `0/2/3/4`
- mapping to gateway internal route

**Step 2: Run tests to verify failure**

Run: `bun test tests/unit/carvis-schedule-cli.test.ts tests/contract/carvis-schedule-cli.contract.test.ts`

Expected: FAIL because CLI does not exist yet.

### Task 3: Implement `carvis-schedule` CLI package

**Files:**
- Create: `packages/carvis-schedule-cli/package.json`
- Create: `packages/carvis-schedule-cli/src/index.ts`
- Create: `packages/carvis-schedule-cli/src/bin.ts`
- Create: `packages/carvis-schedule-cli/src/command-parser.ts`
- Create: `packages/carvis-schedule-cli/src/gateway-client.ts`

**Step 1: Implement minimal parser**

Support:
- `create`
- `list`
- `update`
- `disable`

**Step 2: Implement gateway client**

Call existing internal route with normalized payload.

**Step 3: Implement stdout / exit code mapping**

Map gateway result:
- `executed -> 0`
- `needs_clarification -> 2`
- `rejected -> 3`
- transport/internal failure -> `4`

**Step 4: Re-run focused tests**

Run: `bun test tests/unit/carvis-schedule-cli.test.ts tests/contract/carvis-schedule-cli.contract.test.ts`

Expected: PASS

### Task 4: Add skill package for CLI usage

**Files:**
- Create: `packages/skill-schedule-cli/package.json`
- Create: `packages/skill-schedule-cli/SKILL.md`
- Modify: `apps/gateway/src/services/schedule-management-prompt.ts`

**Step 1: Write failing prompt/skill test**

Assert prompt no longer tells agent to use MCP tools; it should tell agent to use `carvis-schedule`.

**Step 2: Run focused test**

Run: `bun test tests/unit/schedule-management-prompt.test.ts`

Expected: FAIL with old prompt wording.

**Step 3: Implement minimal prompt/skill change**

Replace tool-first MCP wording with CLI-first skill wording.

**Step 4: Re-run test**

Expected: PASS

### Task 5: Remove MCP dependency from bridge runtime

**Files:**
- Modify: `packages/bridge-codex/src/cli-transport.ts`
- Modify: `apps/executor/src/bootstrap.ts`
- Modify: `tests/unit/bridge-codex-cli-transport.test.ts`
- Modify: `tests/integration/executor-startup.test.ts`

**Step 1: Write failing bridge/runtime tests**

Assert:
- no MCP readiness probe
- no global MCP installation requirement
- readiness checks CLI availability instead

**Step 2: Run focused tests**

Run: `bun test tests/unit/bridge-codex-cli-transport.test.ts tests/integration/executor-startup.test.ts`

Expected: FAIL because bridge still expects MCP.

**Step 3: Implement minimal runtime change**

Switch:
- readiness probe from `codex mcp` / healthcheck MCP to `carvis-schedule --help`
- execution path to rely on CLI+skill only

**Step 4: Re-run focused tests**

Expected: PASS

### Task 6: Replace install artifacts

**Files:**
- Delete: `packages/mcp-schedule/package.json`
- Delete: `packages/mcp-schedule/src/index.ts`
- Delete: `packages/mcp-schedule/src/bin.ts`
- Delete: `packages/skill-schedule-management/package.json`
- Delete: `packages/skill-schedule-management/SKILL.md`
- Delete: `scripts/install-codex-schedule-tools.ts`
- Add: CLI skill install docs if needed

**Step 1: Update failing references**

Run: `rg -n "mcp-schedule|skill-schedule-management|install:codex-schedule-tools" .`

Expected: references still exist.

**Step 2: Remove legacy artifacts**

Delete unused MCP-first packaging and installation code.

**Step 3: Re-run reference scan**

Expected: MCP-specific packaging references are gone or intentionally documented as deprecated.

### Task 7: End-to-end CLI path verification

**Files:**
- Modify: `tests/integration/feishu-schedule-create.test.ts`
- Modify: `tests/integration/feishu-schedule-list.test.ts`
- Modify: `tests/integration/feishu-schedule-update.test.ts`
- Modify: `tests/integration/feishu-schedule-disable.test.ts`
- Modify: `specs/007-agent-managed-scheduling/quickstart.md`

**Step 1: Update integration expectations**

Assert that the agent path is CLI-driven rather than MCP-driven.

**Step 2: Run focused integration tests**

Run: `bun test tests/integration/feishu-schedule-create.test.ts tests/integration/feishu-schedule-list.test.ts tests/integration/feishu-schedule-update.test.ts tests/integration/feishu-schedule-disable.test.ts`

Expected: PASS

**Step 3: Run full verification**

Run: `bun run lint`
Expected: PASS

Run: `bun test`
Expected: PASS

**Step 4: Real runtime validation**

Verify with a real chat request that agent executes `carvis-schedule` and a real schedule is created and later triggers.
