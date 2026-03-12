import { describe, expect, test } from "bun:test";

import { runMemoryBenchmarkSuite } from "../support/memory-benchmark-runner.ts";

describe("workspace memory benchmark report contract", () => {
  test("workspace-memory report includes suite-level evidence fields", async () => {
    const report = await runMemoryBenchmarkSuite({
      fixtureRoot: "tests/fixtures/memory-benchmark/l1-golden",
    });

    expect(report.caseCount).toBeGreaterThan(0);
    expect(report.results[0]?.costMetrics.preflightLatencyMs).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(report.failedCaseIds)).toBe(true);
    expect(typeof report.gate.passed).toBe("boolean");
  });
});
