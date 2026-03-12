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
        manualEditPaths: [],
        memoryWriteObservations: [],
        memoryFlushObservation: {
          triggered: false,
          changed: false,
          targetPath: null,
          writeCount: 0,
        },
        memoryExcerpt: {
          excerptText: "",
          sources: [],
          selectedSections: [],
          approxTokens: 0,
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
          classifierLatencyMs: 0,
          recallLatencyMs: 10,
          preflightLatencyMs: 10,
          augmentationTokens: 40,
          augmentationTokenRatio: 0.1,
          filesScannedPerSync: 0,
          toolCallCount: 0,
          toolReadCount: 0,
          toolWriteCount: 0,
        },
      },
    });

    expect(scored.passed).toBeFalse();
    expect(scored.failureReasons).toContain("forbidden recall: yarn");
  });
});
