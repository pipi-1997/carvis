import { describe, expect, test } from "bun:test";

import { runAllMemoryBenchmarkSuites } from "../support/memory-benchmark-runner.ts";

describe("memory benchmark gate integration", () => {
  test("aggregate report blocks rollout when memory runtime is unavailable", async () => {
    const report = await runAllMemoryBenchmarkSuites();

    expect(report.rolloutRecommendation).toBe("blocked");
    expect(report.globalGate.passed).toBeFalse();
  });
});
