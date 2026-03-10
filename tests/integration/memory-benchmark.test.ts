import { describe, expect, test } from "bun:test";

import { runMemoryBenchmarkSuite } from "../support/memory-benchmark-runner.ts";

describe("workspace memory benchmark", () => {
  test("runs golden fixtures and honestly reports unsupported memory paths as failures", async () => {
    const report = await runMemoryBenchmarkSuite({
      fixtureRoot: "tests/fixtures/memory-benchmark/l1-golden",
    });

    expect(report.caseCount).toBeGreaterThan(0);
    expect(report.failedCaseIds).toContain("golden-remember-bun");
    expect(report.gate.passed).toBeFalse();
  });
});
