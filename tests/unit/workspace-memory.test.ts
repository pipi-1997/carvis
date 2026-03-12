import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildWorkspaceMemoryExcerpt,
  captureWorkspaceMemoryState,
  observeWorkspaceMemoryWrites,
  resolveWorkspaceMemoryPaths,
} from "../../apps/executor/src/services/workspace-memory.ts";

describe("workspace memory", () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanup.splice(0).map(async (target) => {
        await rm(target, { recursive: true, force: true });
      }),
    );
  });

  test("resolves workspace memory paths for today and yesterday", () => {
    const paths = resolveWorkspaceMemoryPaths({
      workspacePath: "/tmp/carvis-workspace",
      now: new Date("2026-03-12T08:00:00.000Z"),
    });

    expect(paths.memoryPath).toBe("/tmp/carvis-workspace/.carvis/MEMORY.md");
    expect(paths.todayDailyMemoryPath).toBe("/tmp/carvis-workspace/.carvis/memory/2026-03-12.md");
    expect(paths.yesterdayDailyMemoryPath).toBe("/tmp/carvis-workspace/.carvis/memory/2026-03-11.md");
  });

  test("builds a bounded excerpt from long-term and daily memory sources", () => {
    const excerpt = buildWorkspaceMemoryExcerpt({
      maxChars: 120,
      memories: [
        {
          kind: "long_term",
          path: ".carvis/MEMORY.md",
          content: "## Decisions\n- project uses bun\n## Preferences\n- lead with conclusion\n",
        },
        {
          kind: "daily",
          path: ".carvis/memory/2026-03-12.md",
          content: "- discussed benchmark guard tightening today\n",
        },
      ],
    });

    expect(excerpt.sources).toEqual([".carvis/MEMORY.md", ".carvis/memory/2026-03-12.md"]);
    expect(excerpt.excerptText).toContain("project uses bun");
    expect(excerpt.excerptText).toContain("benchmark guard");
    expect(excerpt.excerptText.length).toBeLessThanOrEqual(120);
    expect(excerpt.approxTokens).toBeGreaterThan(0);
  });

  test("captures memory state and reports write observations across long-term and daily files", async () => {
    const root = await mkdtemp(join(tmpdir(), "carvis-workspace-memory-"));
    cleanup.push(root);
    await mkdir(join(root, ".carvis", "memory"), { recursive: true });

    const before = await captureWorkspaceMemoryState({
      workspacePath: root,
      now: new Date("2026-03-12T08:00:00.000Z"),
    });

    await writeFile(join(root, ".carvis", "MEMORY.md"), "## Decisions\n- project uses bun\n", "utf8");
    await writeFile(join(root, ".carvis", "memory", "2026-03-12.md"), "- discussed benchmark guard\n", "utf8");

    const after = await captureWorkspaceMemoryState({
      workspacePath: root,
      now: new Date("2026-03-12T08:00:00.000Z"),
    });
    const observations = observeWorkspaceMemoryWrites({ before, after });

    expect(observations).toHaveLength(2);
    expect(observations.map((item) => item.changeType).sort()).toEqual(["daily", "long_term"]);
    expect(observations.every((item) => item.changed)).toBe(true);
  });
});
