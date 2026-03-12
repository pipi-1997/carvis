import { describe, expect, test } from "bun:test";

import { createMemoryBenchmarkTrace } from "../support/memory-benchmark-trace.ts";
import { createHarness } from "../support/harness.ts";

describe("workspace memory benchmark runtime contract", () => {
  test("trace exposes memory write observations, excerpt, and tool-cost fields", async () => {
    const harness = createHarness();

    await harness.postFeishuText("总结一下当前方案");
    await harness.executor.processNext();

    const trace = createMemoryBenchmarkTrace({
      caseId: "benchmark-runtime-contract",
      suite: "L1-golden",
      harness,
      metrics: {
        classifierLatencyMs: 0,
        recallLatencyMs: 0,
        preflightLatencyMs: 1,
        augmentationTokens: 0,
        augmentationTokenRatio: 0,
        filesScannedPerSync: 0,
        toolCallCount: 0,
        toolReadCount: 0,
        toolWriteCount: 0,
      },
    });

    expect(Array.isArray(trace.memoryWriteObservations)).toBe(true);
    expect(trace.memoryExcerpt).toEqual({
      excerptText: expect.any(String),
      sources: expect.any(Array),
      selectedSections: expect.any(Array),
      approxTokens: expect.any(Number),
    });
    expect(typeof trace.metrics.toolCallCount).toBe("number");
    expect(typeof trace.metrics.toolReadCount).toBe("number");
    expect(typeof trace.metrics.toolWriteCount).toBe("number");
  });
});
