import { describe, expect, test } from "bun:test";

import type { CodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { createHarness } from "../support/harness.ts";

describe("workspace memory operator visibility", () => {
  test("logs noop when run completes without memory writes", async () => {
    const harness = createHarness();

    await harness.postFeishuText("只是随便聊聊，不需要记忆");
    await harness.executor.processNext();

    expect(
      harness.logger.listEntries().some((entry) => entry.message === "workspace.memory.noop"),
    ).toBe(true);
  });

  test("logs failure when run fails after memory preflight", async () => {
    const transport: CodexTransport = {
      async *run() {
        yield {
          type: "error",
          failureCode: "timeout",
          failureMessage: "run timed out",
        };
      },
    };
    const harness = createHarness({ transport });

    await harness.postFeishuText("请记住我们今天调了 benchmark");
    await harness.executor.processNext();

    expect(
      harness.logger.listEntries().some(
        (entry) =>
          entry.message === "workspace.memory.failed"
          && entry.context?.failureCode === "timeout",
      ),
    ).toBe(true);
  });
});
