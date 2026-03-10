import { describe, expect, test } from "bun:test";

import { FeishuAdapter } from "../../packages/channel-feishu/src/adapter.ts";
import { normalizeFeishuWebsocketEvent } from "../../packages/channel-feishu/src/websocket.ts";
import { createFeishuPayload } from "../support/harness.ts";

describe("feishu command normalization contract", () => {
  test("webhook inbound 会在群聊 mention 前缀后识别 /bind 命令", async () => {
    const adapter = new FeishuAdapter({
      signingSecret: "test-secret",
      sender: {
        addReaction: async () => {},
        removeReaction: async () => {},
        sendMessage: async () => ({ messageId: "delivery-1" }),
      },
    });

    const envelope = await adapter.parseInbound(
      createFeishuPayload("@carvis /bind life-okr", {
        chat_id: "chat-001",
        chat_type: "group",
        mentions: [{ name: "carvis" }],
      }),
    );

    expect(envelope).toMatchObject({
      command: "bind",
      commandArgs: ["life-okr"],
      prompt: null,
      rawText: "/bind life-okr",
      unknownCommand: null,
    });
  });

  test("webhook inbound 会将 /help 识别为命令而不是 prompt", async () => {
    const adapter = new FeishuAdapter({
      signingSecret: "test-secret",
      sender: {
        addReaction: async () => {},
        removeReaction: async () => {},
        sendMessage: async () => ({ messageId: "delivery-2" }),
      },
    });

    const envelope = await adapter.parseInbound(createFeishuPayload("/help"));

    expect(envelope).toMatchObject({
      command: "help",
      commandArgs: [],
      prompt: null,
      unknownCommand: null,
      rawText: "/help",
    });
  });

  test("websocket inbound 会在 mention 前缀后识别 /help 命令", () => {
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
              text: "@carvis /help",
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
      command: "help",
      prompt: null,
      rawText: "/help",
      unknownCommand: null,
    });
  });

  test("未知 slash 命令会被标记为 unknown，而不是普通 prompt", async () => {
    const adapter = new FeishuAdapter({
      signingSecret: "test-secret",
      sender: {
        addReaction: async () => {},
        removeReaction: async () => {},
        sendMessage: async () => ({ messageId: "delivery-3" }),
      },
    });

    const webhookEnvelope = await adapter.parseInbound(createFeishuPayload("/bindd ops"));
    expect(webhookEnvelope).toMatchObject({
      command: null,
      prompt: null,
      rawText: "/bindd ops",
      unknownCommand: "/bindd",
    });

    const websocketResult = normalizeFeishuWebsocketEvent(
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
            message_id: "msg-003",
            message_type: "text",
            content: JSON.stringify({
              text: "@carvis /bindd ops",
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

    expect(websocketResult.accepted).toBe(true);
    if (!websocketResult.accepted) {
      throw new Error("expected accepted event");
    }

    expect(websocketResult.envelope).toMatchObject({
      command: null,
      prompt: null,
      rawText: "/bindd ops",
      unknownCommand: "/bindd",
    });
  });

  test("webhook inbound 没有 mention 元数据时不会误删普通 @token prompt", async () => {
    const adapter = new FeishuAdapter({
      signingSecret: "test-secret",
      sender: {
        addReaction: async () => {},
        removeReaction: async () => {},
        sendMessage: async () => ({ messageId: "delivery-4" }),
      },
    });

    const envelope = await adapter.parseInbound(
      createFeishuPayload("@alice 请看 README", {
        chat_id: "p2p-001",
        chat_type: "p2p",
      }),
    );

    expect(envelope).toMatchObject({
      command: null,
      prompt: "@alice 请看 README",
      rawText: "@alice 请看 README",
      unknownCommand: null,
    });
  });

  test("webhook inbound 不会把任意 @user /command 识别为 bot 命令", async () => {
    const adapter = new FeishuAdapter({
      signingSecret: "test-secret",
      sender: {
        addReaction: async () => {},
        removeReaction: async () => {},
        sendMessage: async () => ({ messageId: "delivery-5" }),
      },
    });

    const envelope = await adapter.parseInbound(
      createFeishuPayload("@alice /bind ops", {
        chat_id: "chat-001",
        chat_type: "group",
      }),
    );

    expect(envelope).toMatchObject({
      command: null,
      commandArgs: [],
      prompt: "@alice /bind ops",
      rawText: "@alice /bind ops",
      unknownCommand: null,
    });
  });
});
