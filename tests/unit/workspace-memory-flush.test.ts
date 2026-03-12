import { describe, expect, test } from "bun:test";

import {
  resolveWorkspaceMemoryFlushPlan,
  shouldTriggerWorkspaceMemoryFlush,
} from "../../apps/executor/src/services/workspace-memory-flush.ts";

describe("workspace memory flush", () => {
  test("triggers only when near compaction and not already handled", () => {
    expect(
      shouldTriggerWorkspaceMemoryFlush({
        alreadyFlushed: false,
        cancelled: false,
        nearCompaction: true,
        timedOut: false,
      }),
    ).toBe(true);

    expect(
      shouldTriggerWorkspaceMemoryFlush({
        alreadyFlushed: true,
        cancelled: false,
        nearCompaction: true,
        timedOut: false,
      }),
    ).toBe(false);

    expect(
      shouldTriggerWorkspaceMemoryFlush({
        alreadyFlushed: false,
        cancelled: false,
        nearCompaction: false,
        timedOut: false,
      }),
    ).toBe(false);
    expect(
      shouldTriggerWorkspaceMemoryFlush({
        alreadyFlushed: false,
        cancelled: false,
        nearCompaction: true,
        timedOut: true,
      }),
    ).toBe(false);
  });

  test("resolves flush target path for the current day and keeps outputs silent", () => {
    const plan = resolveWorkspaceMemoryFlushPlan({
      now: new Date("2026-03-12T08:00:00.000Z"),
      workspacePath: "/tmp/carvis-workspace",
    });

    expect(plan.targetPath).toBe("/tmp/carvis-workspace/.carvis/memory/2026-03-12.md");
    expect(plan.userVisibleOutputCount).toBe(0);
  });
});
