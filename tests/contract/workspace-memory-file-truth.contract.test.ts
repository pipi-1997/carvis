import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadWorkspaceMemoryContext } from "../../apps/executor/src/services/workspace-memory.ts";
import { normalizeFeishuCommandText } from "../../packages/channel-feishu/src/command-normalization.ts";

describe("workspace memory file truth contract", () => {
  test("reads directly from workspace files without requiring sync", async () => {
    const root = await mkdtemp(join(tmpdir(), "carvis-memory-file-truth-"));
    try {
      await mkdir(join(root, ".carvis"), { recursive: true });
      await writeFile(join(root, ".carvis", "MEMORY.md"), "## Facts\n- file is truth\n", "utf8");

      const context = await loadWorkspaceMemoryContext({
        workspacePath: root,
        now: new Date("2026-03-08T00:00:00.000Z"),
      });

      expect(context.excerptText).toContain("file is truth");
      expect(context.sources).toEqual([".carvis/MEMORY.md"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("keeps /memory sync unsupported", () => {
    const normalized = normalizeFeishuCommandText({
      text: "/memory sync",
      mentions: [],
    });

    expect(normalized.command).toBeNull();
    expect(normalized.unknownCommand).toBe("/memory");
  });
});
