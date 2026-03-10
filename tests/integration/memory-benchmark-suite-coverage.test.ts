import { describe, expect, test } from "bun:test";

import { runAllMemoryBenchmarkSuites } from "../support/memory-benchmark-runner.ts";

describe("memory benchmark suite coverage", () => {
  test("loads replay and adversarial fixtures into aggregate report", async () => {
    const report = await runAllMemoryBenchmarkSuites();

    expect(report.suites).toContain("L2-replay");
    expect(report.suites).toContain("L3-adversarial");
  });
});
