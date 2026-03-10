import { describe, expect, test } from "bun:test";

import { runMemoryBenchmarkSuite } from "../support/memory-benchmark-runner.ts";

describe("memory benchmark runner contract", () => {
  test("suite report contains effect and cost metric fields", async () => {
    const report = await runMemoryBenchmarkSuite({
      fixtureRoot: "tests/fixtures/memory-benchmark/l1-golden",
    });

    expect(report.caseCount).toBeGreaterThan(0);
    expect(report.metrics.augmentationTokenRatioP95).toBeDefined();
    expect(report.metrics.recallHitRate).toBeDefined();
  });
});
