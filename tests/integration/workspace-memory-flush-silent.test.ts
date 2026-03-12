import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { createHarness } from "../support/harness.ts";

describe("workspace memory flush silence", () => {
  test("does not emit user-visible outputs for the flush turn", async () => {
    const transport: CodexTransport = {
      async *run(request) {
        if (request.prompt.includes("Pre-compaction memory flush.")) {
          const targetDir = join(request.workspace, ".carvis", "memory");
          await mkdir(targetDir, { recursive: true });
          await writeFile(join(targetDir, "2026-03-08.md"), "- silent flush note\n", "utf8");
          yield { type: "summary", summary: "NO_REPLY", sequence: 1 };
          yield { type: "result", resultSummary: "NO_REPLY" };
          return;
        }
        yield { type: "summary", summary: "主任务结果", sequence: 1 };
        yield { type: "result", resultSummary: "done" };
      },
    };
    const harness = createHarness({ transport });
    const longPrompt = "请保留这些重要内容，后面压缩前不要丢。".repeat(40);

    await harness.postFeishuText("先建立一轮上下文");
    await harness.executor.processNext();
    await harness.postFeishuText(longPrompt);
    await harness.executor.processNext();

    expect(harness.sentMessages.every((message) => !message.content.includes("NO_REPLY"))).toBe(true);
    expect(
      harness.bridgeRequests.filter((request) => request.id.endsWith(":memory-flush")),
    ).toHaveLength(1);
  });
});
