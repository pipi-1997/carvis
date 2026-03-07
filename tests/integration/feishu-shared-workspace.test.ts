import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("shared workspace queue", () => {
  test("两个 chat 共享同一 workspace 的排队状态", async () => {
    const harness = createHarness({
      transportScript: [{ type: "wait-for-cancel" }],
    });

    await harness.postFeishuText("第一条请求", {
      chat_id: "chat-001",
      message_id: "msg-001",
      user_id: "user-001",
    });
    const firstRun = harness.executor.processNext();

    await harness.postFeishuText("第二条请求", {
      chat_id: "chat-002",
      message_id: "msg-002",
      user_id: "user-002",
    });

    const secondRun = await harness.repositories.runs.getLatestRunByChat("feishu", "chat-002");

    expect(secondRun?.status).toBe("queued");
    expect(secondRun?.queuePosition).toBe(1);

    await harness.cancelSignals.requestCancellation((await harness.repositories.runs.listRuns())[0].id);
    await firstRun;
  });
});
