import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createHarness } from "../support/harness.ts";

describe("workspace memory recall", () => {
  test("injects bounded memory guidance and recalled files into bridge prompt", async () => {
    const harness = createHarness();
    const workspaceRoot = harness.agentConfig.workspace;
    await mkdir(join(workspaceRoot, ".carvis", "memory"), { recursive: true });
    await writeFile(join(workspaceRoot, ".carvis", "MEMORY.md"), "## Decisions\n- project uses bun\n", "utf8");
    await writeFile(
      join(workspaceRoot, ".carvis", "memory", "2026-03-06.md"),
      "- ignore me because I am older than yesterday\n",
      "utf8",
    );
    await writeFile(
      join(workspaceRoot, ".carvis", "memory", "2026-03-07.md"),
      "- benchmark threshold discussion yesterday\n",
      "utf8",
    );

    await harness.postFeishuText("总结一下当前项目约定");
    await harness.executor.processNext();

    expect(harness.bridgeRequests).toHaveLength(1);
    const prompt = harness.bridgeRequests[0]?.prompt ?? "";
    expect(prompt).toContain("## Workspace Memory");
    expect(prompt).toContain("Long-term memory path: .carvis/MEMORY.md");
    expect(prompt).toContain("project uses bun");
    expect(prompt).toContain("benchmark threshold discussion yesterday");
    expect(prompt).not.toContain("ignore me because I am older");
  });
});
