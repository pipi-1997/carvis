import { describe, expect, test } from "bun:test";

import { FeishuAdapter } from "../../packages/channel-feishu/src/adapter.ts";
import { normalizeFeishuWebsocketEvent } from "../../packages/channel-feishu/src/websocket.ts";
import { createFeishuPayload } from "../support/harness.ts";

describe("feishu workspace routing contract", () => {
  test("webhook inbound 会保留 private chat 类型和未来扩展 hint 字段", async () => {
    const adapter = new FeishuAdapter({
      signingSecret: "test-secret",
      sender: {
        addReaction: async () => {},
        removeReaction: async () => {},
        sendMessage: async () => ({ messageId: "delivery-1" }),
      },
    });

    const envelope = await adapter.parseInbound(
      createFeishuPayload("帮我总结仓库目标", {
        chat_id: "p2p-001",
        chat_type: "p2p",
      }),
    );

    expect(envelope).toMatchObject({
      channel: "feishu",
      sessionKey: "p2p-001",
      chatId: "p2p-001",
      chatType: "private",
      command: null,
      commandArgs: [],
      prompt: "帮我总结仓库目标",
      conversationHint: null,
      threadHint: null,
    });
  });

  test("websocket inbound 会将群聊普通消息归一化为 group chat envelope", () => {
    const result = normalizeFeishuWebsocketEvent(
      {
        schema: "2.0",
        header: {
          event_type: "im.message.receive_v1",
        },
        event: {
          sender: {
            sender_id: {
              open_id: "user-001",
            },
          },
          message: {
            chat_id: "chat-ops",
            chat_type: "group",
            message_id: "msg-001",
            message_type: "text",
            content: JSON.stringify({
              text: "帮我检查 CI 状态",
            }),
          },
        },
      },
      {
        allowFrom: ["chat-ops"],
        requireMention: false,
      },
    );

    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error("expected accepted event");
    }

    expect(result.envelope).toMatchObject({
      chatId: "chat-ops",
      chatType: "group",
      command: null,
      commandArgs: [],
      prompt: "帮我检查 CI 状态",
      conversationHint: null,
      threadHint: null,
    });
  });
});
