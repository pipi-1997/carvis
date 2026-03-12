import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { createHarness } from "../support/harness.ts";

describe("workspace memory flush", () => {
  test("runs a silent flush before the main run when prompt is near compaction", async () => {
    const transport: CodexTransport = {
      async *run(request) {
        if (request.prompt.includes("Pre-compaction memory flush.")) {
          const targetDir = join(request.workspace, ".carvis", "memory");
          await mkdir(targetDir, { recursive: true });
          await writeFile(join(targetDir, "2026-03-08.md"), "- flushed durable session note\n", "utf8");
          yield { type: "result", resultSummary: "NO_REPLY" };
          return;
        }

        yield { type: "summary", summary: "继续处理主任务", sequence: 1 };
        yield { type: "result", resultSummary: "done" };
      },
    };
    const harness = createHarness({ transport });
    const longPrompt = "请总结当前方案，并保留会话尾段的重要上下文。".repeat(20);

    await harness.postFeishuText("先建立一轮上下文");
    await harness.executor.processNext();
    await harness.postFeishuText(longPrompt);
    await harness.executor.processNext();

    const flushed = await readFile(
      join(harness.agentConfig.workspace, ".carvis", "memory", "2026-03-08.md"),
      "utf8",
    );

    expect(flushed).toContain("flushed durable session note");
    expect(
      harness.bridgeRequests.some((request) => request.id.endsWith(":memory-flush")),
    ).toBe(true);
  });
});
