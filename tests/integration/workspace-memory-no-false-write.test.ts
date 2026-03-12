import { describe, expect, test } from "bun:test";
import { access } from "node:fs/promises";
import { join } from "node:path";

import { createHarness } from "../support/harness.ts";

describe("workspace memory false write guard", () => {
  test("does not create durable memory for transient chat", async () => {
    const harness = createHarness();

    await harness.postFeishuText("哈哈，今天先这样吧");
    await harness.executor.processNext();

    await expect(access(join(harness.agentConfig.workspace, ".carvis", "MEMORY.md"))).rejects.toThrow();
    expect(
      harness.logger.listEntries().some((entry) => entry.message === "workspace.memory.noop"),
    ).toBe(true);
  });
});
