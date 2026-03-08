import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("Feishu -> Codex run flow", () => {
  test("普通消息触发运行并回推摘要和结果", async () => {
    const harness = createHarness();

    const response = await harness.postFeishuText("帮我总结当前仓库的目标");

    expect(response.status).toBe(202);

    await harness.executor.processNext();

    const deliveries = await harness.repositories.deliveries.listDeliveries();
    expect(deliveries.map((delivery) => delivery.deliveryKind)).toEqual([
      "card_create",
      "card_complete",
    ]);
    expect(deliveries[1]?.content).toContain("仓库目标已总结");
    expect(harness.reactionOperations).toEqual([
      {
        action: "add",
        emojiType: "OK",
        messageId: "msg-001",
      },
      {
        action: "remove",
        emojiType: "OK",
        messageId: "msg-001",
      },
    ]);
    expect(harness.sentMessages).toEqual([]);
  });
});
