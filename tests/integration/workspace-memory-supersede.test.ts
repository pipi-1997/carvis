import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { CodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { createHarness } from "../support/harness.ts";

describe("workspace memory supersede", () => {
  test("replaces conflicting long-term facts and recalls only the latest one", async () => {
    const transport: CodexTransport = {
      async *run(request) {
        const memoryPath = join(request.workspace, ".carvis", "MEMORY.md");
        await mkdir(join(request.workspace, ".carvis"), { recursive: true });

        if (request.prompt.includes("本项目使用 yarn")) {
          await writeFile(memoryPath, "## Decisions\n- yarn\n", "utf8");
        }
        if (request.prompt.includes("之前说用 yarn 作废，现在统一 bun")) {
          await writeFile(memoryPath, "## Decisions\n- bun\n", "utf8");
        }

        yield { type: "summary", summary: "done", sequence: 1 };
        yield { type: "result", resultSummary: "done" };
      },
    };
    const harness = createHarness({ transport });

    await harness.postFeishuText("本项目使用 yarn", { chat_id: "chat-update", message_id: "msg-201" });
    await harness.executor.processNext();
    await harness.postFeishuText("之前说用 yarn 作废，现在统一 bun", {
      chat_id: "chat-update",
      message_id: "msg-202",
    });
    await harness.executor.processNext();
    await harness.postFeishuText("怎么启动这个项目", { chat_id: "chat-update", message_id: "msg-203" });
    await harness.executor.processNext();

    const memoryFile = await readFile(join(harness.agentConfig.workspace, ".carvis", "MEMORY.md"), "utf8");
    expect(memoryFile).toContain("bun");
    expect(memoryFile).not.toContain("yarn");
    expect(harness.bridgeRequests.at(-1)?.prompt).toContain("bun");
    expect(harness.bridgeRequests.at(-1)?.prompt).not.toContain("yarn");
  });
});
