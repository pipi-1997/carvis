# Workspace Memory Benchmark Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first offline, repeatable benchmark for `carvis` workspace memory so effect and cost gates are measured before memory features expand.

**Architecture:** Reuse the existing in-memory `tests/support/harness.ts` runtime as the system under test, add a structured benchmark fixture schema plus trace collection, then execute benchmark cases through a runner that emits scores and gate results. Keep v1 offline-only: golden fixtures are the primary source of truth, with replay/adversarial fixture support designed in but kept small.

**Tech Stack:** Bun 1.x, TypeScript 5.x, existing `bun test` harness, `tests/support/harness.ts`, `packages/core` domain types

---

### Task 1: Define Benchmark Domain Model

**Files:**
- Create: `packages/core/src/domain/memory-benchmark.ts`
- Modify: `packages/core/src/domain/index.ts`
- Modify: `packages/core/src/index.ts`
- Test: `tests/unit/memory-benchmark-models.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import type {
  MemoryBenchmarkCase,
  MemoryBenchmarkExpectation,
  MemoryBenchmarkTrace,
} from "../../packages/core/src/domain/memory-benchmark.ts";

describe("memory benchmark models", () => {
  test("supports benchmark case, expectation and trace shapes", () => {
    const benchmarkCase: MemoryBenchmarkCase = {
      id: "golden-remember-bun",
      suite: "L1-golden",
      workspaceKey: "main",
      transcript: [
        { role: "user", text: "/remember 本项目统一使用 bun" },
        { role: "user", text: "怎么启动这个项目" },
      ],
      expectation: {
        intent: "remember",
        recalledItemTitles: ["toolchain"],
      },
    };

    const trace: MemoryBenchmarkTrace = {
      caseId: benchmarkCase.id,
      classifierLatencyMs: 12,
      recallLatencyMs: 8,
      augmentationTokens: 61,
      writes: [],
      recalls: [],
    };

    expect(benchmarkCase.expectation.intent).toBe("remember");
    expect(trace.augmentationTokens).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/memory-benchmark-models.test.ts`

Expected: FAIL with module not found for `memory-benchmark.ts`

**Step 3: Write minimal implementation**

```ts
export type MemoryBenchmarkSuite = "L1-golden" | "L2-replay" | "L3-adversarial";
export type MemoryBenchmarkIntent = "remember" | "forget" | "update" | "not_memory";

export interface MemoryBenchmarkTurn {
  role: "user" | "system";
  text: string;
}

export interface MemoryBenchmarkExpectation {
  intent?: MemoryBenchmarkIntent;
  recalledItemTitles?: string[];
  forbiddenItemTitles?: string[];
}

export interface MemoryBenchmarkCase {
  id: string;
  suite: MemoryBenchmarkSuite;
  workspaceKey: string;
  transcript: MemoryBenchmarkTurn[];
  expectation: MemoryBenchmarkExpectation;
}

export interface MemoryBenchmarkTrace {
  caseId: string;
  classifierLatencyMs: number;
  recallLatencyMs: number;
  augmentationTokens: number;
  writes: string[];
  recalls: string[];
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/memory-benchmark-models.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add packages/core/src/domain/memory-benchmark.ts packages/core/src/domain/index.ts packages/core/src/index.ts tests/unit/memory-benchmark-models.test.ts
git commit -m "feat: add workspace memory benchmark domain models"
```

### Task 2: Add Fixture Loader And Validation

**Files:**
- Create: `tests/support/memory-benchmark-fixtures.ts`
- Create: `tests/fixtures/memory-benchmark/l1-golden/remember-bun.json`
- Create: `tests/fixtures/memory-benchmark/l1-golden/not-memory-chat.json`
- Test: `tests/unit/memory-benchmark-fixtures.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { loadMemoryBenchmarkFixtures } from "../support/memory-benchmark-fixtures.ts";

describe("memory benchmark fixtures", () => {
  test("loads fixture files into typed benchmark cases", async () => {
    const fixtures = await loadMemoryBenchmarkFixtures("tests/fixtures/memory-benchmark/l1-golden");

    expect(fixtures.length).toBeGreaterThan(0);
    expect(fixtures.map((fixture) => fixture.id)).toContain("golden-remember-bun");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/memory-benchmark-fixtures.test.ts`

Expected: FAIL with loader not found

**Step 3: Write minimal implementation**

```ts
import { readdir, readFile } from "node:fs/promises";

import type { MemoryBenchmarkCase } from "../../packages/core/src/domain/memory-benchmark.ts";

export async function loadMemoryBenchmarkFixtures(root: string): Promise<MemoryBenchmarkCase[]> {
  const files = (await readdir(root)).filter((file) => file.endsWith(".json")).sort();
  return Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(`${root}/${file}`, "utf8")) as MemoryBenchmarkCase,
    ),
  );
}
```

Example fixture:

```json
{
  "id": "golden-remember-bun",
  "suite": "L1-golden",
  "workspaceKey": "main",
  "transcript": [
    { "role": "user", "text": "/remember 本项目统一使用 bun" },
    { "role": "user", "text": "怎么启动这个项目" }
  ],
  "expectation": {
    "intent": "remember",
    "recalledItemTitles": ["toolchain"],
    "forbiddenItemTitles": []
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/memory-benchmark-fixtures.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/support/memory-benchmark-fixtures.ts tests/fixtures/memory-benchmark/l1-golden/remember-bun.json tests/fixtures/memory-benchmark/l1-golden/not-memory-chat.json tests/unit/memory-benchmark-fixtures.test.ts
git commit -m "feat: add workspace memory benchmark fixtures"
```

### Task 3: Extend Harness To Capture Benchmark Trace Artifacts

**Files:**
- Modify: `tests/support/harness.ts`
- Create: `tests/support/memory-benchmark-trace.ts`
- Test: `tests/integration/memory-benchmark-trace.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { createHarness } from "../support/harness.ts";

describe("memory benchmark trace integration", () => {
  test("captures bridge request and user-visible outputs for scoring", async () => {
    const harness = createHarness();

    await harness.postFeishuText("帮我检查仓库");
    await harness.executor.processNext();

    expect(harness.memoryBenchmarkTrace.bridgeRequests.length).toBe(1);
    expect(harness.memoryBenchmarkTrace.sentMessages.length).toBeGreaterThanOrEqual(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/integration/memory-benchmark-trace.test.ts`

Expected: FAIL because `memoryBenchmarkTrace` does not exist on harness

**Step 3: Write minimal implementation**

```ts
export interface MemoryBenchmarkRuntimeTrace {
  bridgeRequests: Array<{
    prompt: string;
    workspace: string;
    sessionMode: string;
  }>;
  sentMessages: Array<{
    kind: string;
    content: string;
  }>;
}
```

Update `createHarness()` to expose:

```ts
const memoryBenchmarkTrace: MemoryBenchmarkRuntimeTrace = {
  bridgeRequests: [],
  sentMessages: [],
};
```

and mirror `bridgeRequests` / `sentMessages` into this structure in stable benchmark-friendly format.

**Step 4: Run test to verify it passes**

Run: `bun test tests/integration/memory-benchmark-trace.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/support/harness.ts tests/support/memory-benchmark-trace.ts tests/integration/memory-benchmark-trace.test.ts
git commit -m "feat: capture workspace memory benchmark traces"
```

### Task 4: Implement Offline Benchmark Runner

**Files:**
- Create: `tests/support/memory-benchmark-runner.ts`
- Create: `tests/integration/memory-benchmark.test.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { runMemoryBenchmarkSuite } from "../support/memory-benchmark-runner.ts";

describe("workspace memory benchmark", () => {
  test("runs golden fixtures and returns report counts", async () => {
    const report = await runMemoryBenchmarkSuite({
      fixtureRoot: "tests/fixtures/memory-benchmark/l1-golden",
    });

    expect(report.caseCount).toBeGreaterThan(0);
    expect(report.failedCaseIds).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/integration/memory-benchmark.test.ts`

Expected: FAIL with runner not found

**Step 3: Write minimal implementation**

```ts
export async function runMemoryBenchmarkSuite(input: { fixtureRoot: string }) {
  const fixtures = await loadMemoryBenchmarkFixtures(input.fixtureRoot);

  const results = [];
  for (const fixture of fixtures) {
    const harness = createHarness();
    const result = await runSingleFixture(harness, fixture);
    results.push(result);
  }

  return {
    caseCount: results.length,
    failedCaseIds: results.filter((result) => !result.passed).map((result) => result.caseId),
    results,
  };
}
```

Add script:

```json
"test:memory-benchmark": "bun test tests/integration/memory-benchmark.test.ts"
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/integration/memory-benchmark.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/support/memory-benchmark-runner.ts tests/integration/memory-benchmark.test.ts package.json
git commit -m "feat: add offline workspace memory benchmark runner"
```

### Task 5: Add Scoring Logic For Effect Metrics

**Files:**
- Create: `tests/support/memory-benchmark-score.ts`
- Test: `tests/unit/memory-benchmark-score.test.ts`
- Modify: `tests/support/memory-benchmark-runner.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { scoreMemoryBenchmarkCase } from "../support/memory-benchmark-score.ts";

describe("memory benchmark scoring", () => {
  test("fails when forbidden recall appears in augmentation", () => {
    const scored = scoreMemoryBenchmarkCase({
      fixture: {
        id: "conflict-case",
        suite: "L1-golden",
        workspaceKey: "main",
        transcript: [],
        expectation: {
          recalledItemTitles: ["bun"],
          forbiddenItemTitles: ["yarn"],
        },
      },
      trace: {
        caseId: "conflict-case",
        classifierLatencyMs: 0,
        recallLatencyMs: 10,
        augmentationTokens: 40,
        writes: [],
        recalls: ["bun", "yarn"],
      },
    });

    expect(scored.passed).toBeFalse();
    expect(scored.failureReasons).toContain("forbidden recall: yarn");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/memory-benchmark-score.test.ts`

Expected: FAIL with scorer not found

**Step 3: Write minimal implementation**

```ts
export function scoreMemoryBenchmarkCase(input: {
  fixture: MemoryBenchmarkCase;
  trace: MemoryBenchmarkTrace;
}) {
  const failureReasons: string[] = [];

  for (const forbidden of input.fixture.expectation.forbiddenItemTitles ?? []) {
    if (input.trace.recalls.includes(forbidden)) {
      failureReasons.push(`forbidden recall: ${forbidden}`);
    }
  }

  for (const expected of input.fixture.expectation.recalledItemTitles ?? []) {
    if (!input.trace.recalls.includes(expected)) {
      failureReasons.push(`missing recall: ${expected}`);
    }
  }

  return {
    caseId: input.fixture.id,
    passed: failureReasons.length === 0,
    failureReasons,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/memory-benchmark-score.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/support/memory-benchmark-score.ts tests/unit/memory-benchmark-score.test.ts tests/support/memory-benchmark-runner.ts
git commit -m "feat: score workspace memory benchmark effect metrics"
```

### Task 6: Add Cost Metrics And Gate Evaluation

**Files:**
- Create: `tests/support/memory-benchmark-gates.ts`
- Test: `tests/unit/memory-benchmark-gates.test.ts`
- Modify: `tests/support/memory-benchmark-runner.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test";
import { evaluateMemoryBenchmarkGates } from "../support/memory-benchmark-gates.ts";

describe("memory benchmark gates", () => {
  test("fails gate when augmentation token ratio exceeds threshold", () => {
    const gate = evaluateMemoryBenchmarkGates({
      metrics: {
        falseWriteRate: 0,
        staleRecallRate: 0,
        recallHitRate: 1,
        augmentationTokenRatioP95: 0.42,
      },
    });

    expect(gate.passed).toBeFalse();
    expect(gate.failures).toContain("augmentation_token_ratio_p95 > 0.20");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/unit/memory-benchmark-gates.test.ts`

Expected: FAIL with gate evaluator not found

**Step 3: Write minimal implementation**

```ts
export function evaluateMemoryBenchmarkGates(input: {
  metrics: {
    falseWriteRate: number;
    staleRecallRate: number;
    recallHitRate: number;
    augmentationTokenRatioP95: number;
  };
}) {
  const failures: string[] = [];

  if (input.metrics.falseWriteRate !== 0) failures.push("false_write_rate != 0");
  if (input.metrics.staleRecallRate !== 0) failures.push("stale_recall_rate != 0");
  if (input.metrics.recallHitRate < 0.95) failures.push("recall_hit_rate < 0.95");
  if (input.metrics.augmentationTokenRatioP95 > 0.2) failures.push("augmentation_token_ratio_p95 > 0.20");

  return {
    passed: failures.length === 0,
    failures,
  };
}
```

Update package scripts:

```json
"test:memory-benchmark:gate": "bun test tests/integration/memory-benchmark.test.ts tests/unit/memory-benchmark-gates.test.ts"
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/unit/memory-benchmark-gates.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/support/memory-benchmark-gates.ts tests/unit/memory-benchmark-gates.test.ts tests/support/memory-benchmark-runner.ts package.json
git commit -m "feat: add workspace memory benchmark gates"
```

### Task 7: Seed Replay And Adversarial Cases

**Files:**
- Create: `tests/fixtures/memory-benchmark/l2-replay/continued-after-new.json`
- Create: `tests/fixtures/memory-benchmark/l3-adversarial/noisy-chat-not-memory.json`
- Create: `tests/fixtures/memory-benchmark/l3-adversarial/superseded-fact-not-recalled.json`
- Test: `tests/integration/memory-benchmark.test.ts`

**Step 1: Write the failing test**

```ts
test("loads replay and adversarial fixtures into the aggregate report", async () => {
  const report = await runAllMemoryBenchmarkSuites();

  expect(report.suites).toContain("L2-replay");
  expect(report.suites).toContain("L3-adversarial");
});
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/integration/memory-benchmark.test.ts`

Expected: FAIL because only golden fixtures are loaded

**Step 3: Write minimal implementation**

```ts
export async function runAllMemoryBenchmarkSuites() {
  const suiteRoots = [
    "tests/fixtures/memory-benchmark/l1-golden",
    "tests/fixtures/memory-benchmark/l2-replay",
    "tests/fixtures/memory-benchmark/l3-adversarial",
  ];

  const reports = await Promise.all(suiteRoots.map((fixtureRoot) => runMemoryBenchmarkSuite({ fixtureRoot })));
  return {
    suites: reports.map((report) => report.suite),
    reports,
  };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test tests/integration/memory-benchmark.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/fixtures/memory-benchmark/l2-replay/continued-after-new.json tests/fixtures/memory-benchmark/l3-adversarial/noisy-chat-not-memory.json tests/fixtures/memory-benchmark/l3-adversarial/superseded-fact-not-recalled.json tests/integration/memory-benchmark.test.ts
git commit -m "feat: add replay and adversarial memory benchmark suites"
```

### Task 8: Document How To Run And Interpret The Benchmark

**Files:**
- Modify: `docs/plans/2026-03-10-workspace-memory-unified-design.md`
- Create: `docs/plans/2026-03-11-workspace-memory-benchmark-ops.md`
- Test: `tests/integration/memory-benchmark.test.ts`

**Step 1: Write the failing doc assertion**

Add a lightweight assertion in the benchmark integration test that the runner prints a summary shape:

```ts
expect(report.metrics.falseWriteRate).toBeDefined();
expect(report.gate.passed).toBeDefined();
```

**Step 2: Run test to verify it fails**

Run: `bun test tests/integration/memory-benchmark.test.ts`

Expected: FAIL because aggregate metrics/gate summary are not exported yet

**Step 3: Write minimal implementation**

Document:

- how to run `bun run test:memory-benchmark`
- how to run `bun run test:memory-benchmark:gate`
- where fixtures live
- what blocks rollout
- how to add a new fixture

Example ops snippet:

```md
1. Add or update fixture JSON under `tests/fixtures/memory-benchmark/`.
2. Run `bun run test:memory-benchmark`.
3. Inspect failed case IDs and gate failures.
4. Do not enable broader automatic memory behavior until `false_write_rate` and `stale_recall_rate` return to zero on `L1-golden`.
```

**Step 4: Run test to verify it passes**

Run: `bun run test:memory-benchmark:gate`

Expected: PASS with summary including metrics and gate

**Step 5: Commit**

```bash
git add docs/plans/2026-03-10-workspace-memory-unified-design.md docs/plans/2026-03-11-workspace-memory-benchmark-ops.md tests/integration/memory-benchmark.test.ts
git commit -m "docs: add workspace memory benchmark operations guide"
```

## Verification Checklist

After implementing all tasks, run:

```bash
bun test tests/unit/memory-benchmark-models.test.ts
bun test tests/unit/memory-benchmark-fixtures.test.ts
bun test tests/integration/memory-benchmark-trace.test.ts
bun test tests/unit/memory-benchmark-score.test.ts
bun test tests/unit/memory-benchmark-gates.test.ts
bun test tests/integration/memory-benchmark.test.ts
bun run test:memory-benchmark
bun run test:memory-benchmark:gate
bun run lint
```

Expected:

- All benchmark unit and integration tests pass
- `test:memory-benchmark` prints case counts, failed case IDs and aggregate metrics
- `test:memory-benchmark:gate` fails when red-line metrics regress
- `bun run lint` exits `0`
