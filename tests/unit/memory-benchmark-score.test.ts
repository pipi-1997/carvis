import { describe, expect, test } from "bun:test";

import { scoreMemoryBenchmarkCase } from "../support/memory-benchmark-score.ts";

describe("memory benchmark scoring", () => {
  test("fails when forbidden recall appears in trace", () => {
    const scored = scoreMemoryBenchmarkCase({
      fixture: {
        id: "conflict-case",
        suite: "L1-golden",
        workspaceKey: "main",
        transcript: [],
        expectation: {
          recalledItemTitles: ["bun"],
          forbiddenItemTitles: ["yarn"],
        },
      },
      trace: {
        caseId: "conflict-case",
        suite: "L1-golden",
        classification: "remember",
        writes: [],
        recalls: ["bun", "yarn"],
        bridgeRequests: [],
        userVisibleOutputs: [],
        runtimeOutcome: "completed",
        signalSources: {
          queue: "runtime-reuse",
          lock: "runtime-reuse",
          heartbeat: "test-double",
        },
        metrics: {
          classifierLatencyMs: 0,
          recallLatencyMs: 10,
          preflightLatencyMs: 10,
          augmentationTokens: 40,
          augmentationTokenRatio: 0.1,
          filesScannedPerSync: 0,
        },
      },
    });

    expect(scored.passed).toBeFalse();
    expect(scored.failureReasons).toContain("forbidden recall: yarn");
  });
});
