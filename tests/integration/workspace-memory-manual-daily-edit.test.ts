import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createHarness } from "../support/harness.ts";

describe("workspace daily memory manual edit", () => {
  test("uses manually edited daily memory content on the next run", async () => {
    const harness = createHarness();
    const workspaceRoot = harness.agentConfig.workspace;
    await mkdir(join(workspaceRoot, ".carvis", "memory"), { recursive: true });
    await writeFile(
      join(workspaceRoot, ".carvis", "memory", "2026-03-08.md"),
      "- benchmark report is due today\n",
      "utf8",
    );

    await harness.postFeishuText("今天还剩什么待办");
    await harness.executor.processNext();

    expect(harness.bridgeRequests[0]?.prompt).toContain("benchmark report is due today");
  });
});
