import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createHarness } from "../support/harness.ts";

describe("workspace memory trace capture", () => {
  test("distinguishes manual file edits from run-driven writes", async () => {
    const harness = createHarness();
    const workspaceRoot = harness.agentConfig.workspace;
    await mkdir(join(workspaceRoot, ".carvis"), { recursive: true });
    await writeFile(join(workspaceRoot, ".carvis", "MEMORY.md"), "## Facts\n- edited manually\n", "utf8");

    await harness.postFeishuText("读取当前工作区记忆");
    await harness.executor.processNext();

    expect(harness.memoryBenchmarkTrace.manualEditPaths).toContain(".carvis/MEMORY.md");
    expect(harness.memoryBenchmarkTrace.memoryWriteObservations).toEqual([]);
  });
});
