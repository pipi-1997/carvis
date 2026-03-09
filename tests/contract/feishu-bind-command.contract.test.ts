import { describe, expect, test } from "bun:test";

import { FeishuAdapter } from "../../packages/channel-feishu/src/adapter.ts";
import { normalizeFeishuWebsocketEvent } from "../../packages/channel-feishu/src/websocket.ts";
import { createFeishuPayload } from "../support/harness.ts";

describe("feishu bind command contract", () => {
  test("webhook inbound 会将 /bind <workspace-key> 识别为 bind 命令和参数", async () => {
    const adapter = new FeishuAdapter({
      signingSecret: "test-secret",
      sender: {
        addReaction: async () => {},
        removeReaction: async () => {},
        sendMessage: async () => ({ messageId: "delivery-1" }),
      },
    });

    const envelope = await adapter.parseInbound(createFeishuPayload("/bind ops"));

    expect(envelope).toMatchObject({
      command: "bind",
      commandArgs: ["ops"],
      prompt: null,
      rawText: "/bind ops",
    });
  });

  test("websocket inbound 会将 /bind feature-a 识别为 bind 命令和参数", () => {
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
            chat_id: "chat-001",
            chat_type: "group",
            message_id: "msg-002",
            message_type: "text",
            content: JSON.stringify({
              text: "@carvis /bind feature-a",
            }),
            mentions: [{ name: "carvis" }],
          },
        },
      },
      {
        allowFrom: ["chat-001"],
        requireMention: true,
      },
    );

    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error("expected accepted event");
    }

    expect(result.envelope).toMatchObject({
      command: "bind",
      commandArgs: ["feature-a"],
      prompt: null,
      rawText: "/bind feature-a",
    });
  });
});
