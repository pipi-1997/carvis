import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { createHarness } from "../support/harness.ts";

describe("workspace long-term memory writes", () => {
  test("records a long-term workspace fact during a normal run", async () => {
    const transport: CodexTransport = {
      async *run(request) {
        if (request.prompt.includes("这个项目统一使用 bun")) {
          await mkdir(join(request.workspace, ".carvis"), { recursive: true });
          await writeFile(join(request.workspace, ".carvis", "MEMORY.md"), "## Decisions\n- project uses bun\n", "utf8");
        }
        yield { type: "summary", summary: "已记录项目约定", sequence: 1 };
        yield { type: "result", resultSummary: "done" };
      },
    };
    const harness = createHarness({ transport });

    await harness.postFeishuText("这个项目统一使用 bun");
    await harness.executor.processNext();

    const memoryFile = await readFile(join(harness.agentConfig.workspace, ".carvis", "MEMORY.md"), "utf8");
    expect(memoryFile).toContain("project uses bun");
    expect(harness.logger.listEntries().some((entry) => entry.message === "workspace.memory.write")).toBe(true);
  });
});
