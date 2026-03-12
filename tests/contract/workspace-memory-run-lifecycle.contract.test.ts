import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("workspace memory run lifecycle contract", () => {
  test("queued and running runs remain cancellable through the existing session abort path", async () => {
    const harness = createHarness({
      transportScript: [{ type: "wait-for-cancel" }],
    });

    await harness.postFeishuText("运行一个长任务", { chat_id: "chat-lifecycle", message_id: "msg-001" });
    const running = harness.executor.processNext();
    const response = await harness.postFeishuText("/abort", { chat_id: "chat-lifecycle", message_id: "msg-002" });

    expect(response.status).toBe(200);
    await running;

    const latestRun = await harness.repositories.runs.getLatestRunByChat("feishu", "chat-lifecycle");
    expect(latestRun?.status).toBe("cancelled");
  });
});
