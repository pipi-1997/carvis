import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("chat mode presentation semantics", () => {
  test("群聊与单聊保持一致的 reaction 和单卡片呈现语义", async () => {
    const runScenario = async (chatType: "group" | "p2p") => {
      const harness = createHarness({
        transportScript: [{ type: "result", resultSummary: "已完成" }],
        workspaceResolver:
          chatType === "group"
            ? {
                chatBindings: {
                  "group-chat": "main",
                },
              }
            : undefined,
      });

      await harness.postFeishuText("请处理请求", {
        chat_id: `${chatType}-chat`,
        chat_type: chatType,
        message_id: `${chatType}-msg`,
        user_id: `${chatType}-user`,
      });
      await harness.executor.processNext();

      return {
        deliveries: await harness.repositories.deliveries.listDeliveries(),
        operations: harness.presentationOperations.map((operation) => operation.action),
        reactions: harness.reactionOperations,
      };
    };

    const group = await runScenario("group");
    const p2p = await runScenario("p2p");

    expect(group.operations).toEqual(["create-card", "complete-card"]);
    expect(p2p.operations).toEqual(["create-card", "complete-card"]);
    expect(group.reactions).toEqual([
      { action: "add", emojiType: "OK", messageId: "group-msg" },
      { action: "remove", emojiType: "OK", messageId: "group-msg" },
    ]);
    expect(p2p.reactions).toEqual([
      { action: "add", emojiType: "OK", messageId: "p2p-msg" },
      { action: "remove", emojiType: "OK", messageId: "p2p-msg" },
    ]);
    expect(group.deliveries.map((delivery) => delivery.deliveryKind)).toEqual([
      "card_create",
      "card_complete",
    ]);
    expect(p2p.deliveries.map((delivery) => delivery.deliveryKind)).toEqual([
      "card_create",
      "card_complete",
    ]);
  });
});
