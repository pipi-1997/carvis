import { describe, expect, test } from "bun:test";

import { createMemoryBenchmarkGateProfile, evaluateMemoryBenchmarkGates } from "../support/memory-benchmark-gates.ts";

describe("memory benchmark gates", () => {
  test("fails gate when augmentation token ratio exceeds threshold", () => {
    const gate = evaluateMemoryBenchmarkGates({
      gateProfile: createMemoryBenchmarkGateProfile(),
      metrics: {
        falseWriteRate: 0,
        staleRecallRate: 0,
        missedDurableRecallRate: 0,
        recallHitRate: 1,
        augmentationTokenRatioP95: 0.42,
      },
    });

    expect(gate.passed).toBeFalse();
    expect(gate.failures).toContain("augmentation_token_ratio_p95 > 0.20");
  });
});
