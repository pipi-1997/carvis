import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createHarness } from "../support/harness.ts";

describe("workspace memory recall after /new", () => {
  test("keeps workspace memory recall after continuation reset", async () => {
    const harness = createHarness();
    const workspaceRoot = harness.agentConfig.workspace;
    await mkdir(join(workspaceRoot, ".carvis"), { recursive: true });
    await writeFile(join(workspaceRoot, ".carvis", "MEMORY.md"), "## Preferences\n- lead with conclusion\n", "utf8");

    await harness.postFeishuText("/new");
    await harness.postFeishuText("继续总结当前方案");
    await harness.executor.processNext();

    expect(harness.bridgeRequests).toHaveLength(1);
    const request = harness.bridgeRequests[0];
    expect(request?.sessionMode).toBe("fresh");
    expect(request?.prompt).toContain("lead with conclusion");
  });
});
