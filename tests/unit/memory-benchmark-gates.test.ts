import { describe, expect, test } from "bun:test";

import { createMemoryBenchmarkGateProfile, evaluateMemoryBenchmarkGates } from "../support/memory-benchmark-gates.ts";

describe("memory benchmark gates", () => {
  test("fails gate when hot-path cost exceeds threshold", () => {
    const gate = evaluateMemoryBenchmarkGates({
      gateProfile: createMemoryBenchmarkGateProfile(),
      metrics: {
        falseWriteRate: 0,
        staleRecallRate: 0,
        missedDurableRecallRate: 0,
        recallHitRate: 1,
        augmentationTokenRatioP95: 0.42,
        preflightLatencyMsP95: 64,
        filesScannedPerSyncP95: 9,
        toolCallCountP95: 5,
      },
    });

    expect(gate.passed).toBeFalse();
    expect(gate.failures).toContain("augmentation_token_ratio_p95 > 0.20");
    expect(gate.failures).toContain("preflight_latency_ms_p95 > 30");
    expect(gate.failures).toContain("files_scanned_per_sync_p95 > 6");
    expect(gate.failures).toContain("tool_call_count_p95 > 2");
  });
});
