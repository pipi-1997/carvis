import { describe, expect, test } from "bun:test";

import type {
  MemoryBenchmarkCase,
  MemoryBenchmarkTrace,
} from "../../packages/core/src/domain/memory-benchmark.ts";

describe("memory benchmark models", () => {
  test("supports benchmark case and trace shapes", () => {
    const benchmarkCase: MemoryBenchmarkCase = {
      id: "golden-remember-bun",
      suite: "L1-golden",
      workspaceKey: "main",
      transcript: [
        { role: "user", messageId: "msg-001", text: "/remember 本项目统一使用 bun" },
        { role: "user", messageId: "msg-002", text: "怎么启动这个项目" },
      ],
      expectation: {
        intent: "remember",
        recalledItemTitles: ["bun"],
        forbiddenItemTitles: [],
        gateCritical: true,
      },
    };

    const trace: MemoryBenchmarkTrace = {
      caseId: benchmarkCase.id,
      suite: benchmarkCase.suite,
      classification: "remember",
      writes: ["bun"],
      recalls: ["bun"],
      manualEditPaths: [],
      memoryWriteObservations: [
        {
          targetPath: ".carvis/MEMORY.md",
          changeType: "long_term",
          changed: true,
          summary: "updated long-term workspace memory",
        },
      ],
      memoryFlushObservation: {
        triggered: false,
        changed: false,
        targetPath: null,
        writeCount: 0,
      },
      memoryExcerpt: {
        excerptText: "bun",
        sources: [".carvis/MEMORY.md"],
        selectedSections: ["MEMORY.md"],
        approxTokens: 1,
      },
      bridgeRequests: [],
      userVisibleOutputs: [],
      runtimeOutcome: "completed",
      signalSources: {
        queue: "runtime-reuse",
        lock: "runtime-reuse",
        heartbeat: "test-double",
      },
      metrics: {
        classifierLatencyMs: 12,
        recallLatencyMs: 8,
        preflightLatencyMs: 20,
        augmentationTokens: 61,
        augmentationTokenRatio: 0.12,
        filesScannedPerSync: 0,
        toolCallCount: 0,
        toolReadCount: 0,
        toolWriteCount: 1,
      },
    };

    expect(benchmarkCase.expectation.intent).toBe("remember");
    expect(trace.metrics.augmentationTokens).toBeGreaterThan(0);
    expect(trace.memoryWriteObservations[0]?.changeType).toBe("long_term");
    expect(trace.memoryFlushObservation.triggered).toBeFalse();
  });
});
