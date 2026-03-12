import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { createHarness } from "../support/harness.ts";
import { createMemoryBenchmarkTrace } from "../support/memory-benchmark-trace.ts";

describe("workspace memory flush contract", () => {
  test("flush trace fields and operator-visible outcomes stay structured", async () => {
    const transport: CodexTransport = {
      async *run(request) {
        if (request.prompt.includes("Pre-compaction memory flush.")) {
          const dir = join(request.workspace, ".carvis", "memory");
          await mkdir(dir, { recursive: true });
          await writeFile(join(dir, "2026-03-08.md"), "- flushed contract note\n", "utf8");
          yield { type: "result", resultSummary: "NO_REPLY" };
          return;
        }
        yield { type: "result", resultSummary: "done" };
      },
    };
    const harness = createHarness({ transport });

    await harness.postFeishuText("先建立一轮上下文");
    await harness.executor.processNext();
    await harness.postFeishuText("请保留这些重要内容，后面压缩前不要丢。".repeat(40));
    await harness.executor.processNext();

    const trace = createMemoryBenchmarkTrace({
      caseId: "flush-contract",
      suite: "L2-replay",
      harness,
      metrics: {
        classifierLatencyMs: 0,
        recallLatencyMs: 0,
        preflightLatencyMs: 1,
        augmentationTokens: 0,
        augmentationTokenRatio: 0,
        filesScannedPerSync: 0,
        toolCallCount: 0,
        toolReadCount: 0,
        toolWriteCount: 0,
      },
    });

    expect(harness.logger.listEntries().some((entry) => entry.message === "workspace.memory.flush")).toBe(true);
    expect(trace.userVisibleOutputs.every((item) => !item.content.includes("NO_REPLY"))).toBe(true);
  });
});
