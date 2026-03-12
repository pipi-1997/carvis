import { describe, expect, test } from "bun:test";

import { runMemoryBenchmarkSuite } from "../support/memory-benchmark-runner.ts";

describe("workspace memory benchmark", () => {
  test("runs golden fixtures and reports current runtime outcomes", async () => {
    const report = await runMemoryBenchmarkSuite({
      fixtureRoot: "tests/fixtures/memory-benchmark/l1-golden",
    });

    expect(report.caseCount).toBeGreaterThan(0);
    expect(report.failedCaseIds).toEqual([]);
    expect(report.gate.passed).toBeTrue();
  });
});
