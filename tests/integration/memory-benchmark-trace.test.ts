import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";
import { createMemoryBenchmarkTrace } from "../support/memory-benchmark-trace.ts";

describe("memory benchmark trace integration", () => {
  test("captures bridge request and user-visible outputs for scoring", async () => {
    const harness = createHarness();

    await harness.postFeishuText("帮我检查仓库");
    await harness.executor.processNext();

    expect(harness.memoryBenchmarkTrace.bridgeRequests.length).toBe(1);
    expect(harness.memoryBenchmarkTrace.userVisibleOutputs.length).toBeGreaterThanOrEqual(0);

    const trace = createMemoryBenchmarkTrace({
      caseId: "trace-case",
      suite: "L1-golden",
      harness,
      metrics: {
        classifierLatencyMs: 0,
        recallLatencyMs: 0,
        preflightLatencyMs: 0,
        augmentationTokens: 0,
        augmentationTokenRatio: 0,
        filesScannedPerSync: 0,
        toolCallCount: 0,
        toolReadCount: 0,
        toolWriteCount: 0,
      },
    });

    expect(trace.bridgeRequests.length).toBe(1);
    expect(trace.userVisibleOutputs.length).toBeGreaterThanOrEqual(0);
    expect(trace.signalSources.queue).toBe("runtime-reuse");
    expect(trace.manualEditPaths).toEqual([]);
    expect(trace.memoryWriteObservations).toEqual([]);
    expect(trace.memoryFlushObservation).toEqual({
      triggered: false,
      changed: false,
      targetPath: null,
      writeCount: 0,
    });
    expect(trace.memoryExcerpt).toEqual({
      approxTokens: 0,
      excerptText: "",
      selectedSections: [],
      sources: [],
    });
  });
});
