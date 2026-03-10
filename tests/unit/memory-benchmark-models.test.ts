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
      },
    };

    expect(benchmarkCase.expectation.intent).toBe("remember");
    expect(trace.metrics.augmentationTokens).toBeGreaterThan(0);
  });
});
