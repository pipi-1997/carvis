import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { createHarness } from "../support/harness.ts";

describe("workspace daily memory writes", () => {
  test("records same-day context into daily memory during a normal run", async () => {
    const transport: CodexTransport = {
      async *run(request) {
        if (request.prompt.includes("今天我们把 benchmark 的 p95 门槛改成了 30ms")) {
          const targetDir = join(request.workspace, ".carvis", "memory");
          await mkdir(targetDir, { recursive: true });
          await writeFile(join(targetDir, "2026-03-08.md"), "- benchmark p95 gate is 30ms\n", "utf8");
        }
        yield { type: "summary", summary: "已记录今日上下文", sequence: 1 };
        yield { type: "result", resultSummary: "done" };
      },
    };
    const harness = createHarness({ transport });

    await harness.postFeishuText("今天我们把 benchmark 的 p95 门槛改成了 30ms");
    await harness.executor.processNext();

    const dailyFile = await readFile(
      join(harness.agentConfig.workspace, ".carvis", "memory", "2026-03-08.md"),
      "utf8",
    );

    expect(dailyFile).toContain("benchmark p95 gate is 30ms");
    expect(
      harness.logger.listEntries().some(
        (entry) =>
          entry.message === "workspace.memory.write"
          && entry.context?.changeType === "daily",
      ),
    ).toBe(true);
  });
});
