import { describe, expect, test } from "bun:test";

import { runAllMemoryBenchmarkSuites } from "../support/memory-benchmark-runner.ts";

describe("workspace memory benchmark gate", () => {
  test("reports a workspace-memory specific rollout gate result", async () => {
    const report = await runAllMemoryBenchmarkSuites();

    expect(report.reports.length).toBeGreaterThan(0);
    expect(typeof report.globalGate.passed).toBe("boolean");
    expect(report.rolloutRecommendation).toBe("blocked");
  });
});
