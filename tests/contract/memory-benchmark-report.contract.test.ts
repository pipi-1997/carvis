import { describe, expect, test } from "bun:test";

import { createMemoryBenchmarkGateProfile, evaluateMemoryBenchmarkGates } from "../support/memory-benchmark-gates.ts";

describe("memory benchmark report contract", () => {
  test("gate result exposes pass/fail and failures", () => {
    const gate = evaluateMemoryBenchmarkGates({
      gateProfile: createMemoryBenchmarkGateProfile(),
      metrics: {
        falseWriteRate: 0,
        staleRecallRate: 0,
        missedDurableRecallRate: 0,
        recallHitRate: 1,
        augmentationTokenRatioP95: 0.1,
        preflightLatencyMsP95: 10,
        filesScannedPerSyncP95: 2,
        toolCallCountP95: 0,
      },
    });

    expect(typeof gate.passed).toBe("boolean");
    expect(Array.isArray(gate.failures)).toBeTrue();
  });
});
