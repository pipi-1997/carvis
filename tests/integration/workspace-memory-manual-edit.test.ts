import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createHarness } from "../support/harness.ts";

describe("workspace memory manual edit", () => {
  test("uses manually edited MEMORY.md content on the next run", async () => {
    const harness = createHarness();
    const workspaceRoot = harness.agentConfig.workspace;
    await mkdir(join(workspaceRoot, ".carvis"), { recursive: true });
    await writeFile(join(workspaceRoot, ".carvis", "MEMORY.md"), "## Preferences\n- answer briefly\n", "utf8");

    await harness.postFeishuText("接下来怎么回复我");
    await harness.executor.processNext();

    expect(harness.bridgeRequests[0]?.prompt).toContain("answer briefly");
  });
});
