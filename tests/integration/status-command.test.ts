import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("/status integration", () => {
  test("返回当前会话状态和最近请求排队信息", async () => {
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

    const statusResponse = await harness.postFeishuText("/status", {
      chat_id: "chat-002",
      message_id: "msg-003",
      user_id: "user-002",
    });
    const body = await statusResponse.json();

    expect(body.ok).toBeTrue();

    const latestDelivery = (await harness.repositories.deliveries.listDeliveries()).at(-1);
    expect(latestDelivery?.content).toContain("前方队列长度: 1");
    expect(latestDelivery?.content).toContain("sandbox mode: workspace-write");

    await harness.cancelSignals.requestCancellation((await harness.repositories.runs.listRuns())[0].id);
    await firstRun;
  });
});
