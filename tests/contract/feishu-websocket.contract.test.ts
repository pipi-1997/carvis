import { describe, expect, test } from "bun:test";
import * as Lark from "@larksuiteoapi/node-sdk";

import {
  FeishuWebsocketHandshakeError,
  createFeishuWebsocketIngress,
  createFeishuWebsocketTestTransport,
  normalizeFeishuWebsocketEvent,
} from "../../packages/channel-feishu/src/index.ts";

describe("feishu websocket contract", () => {
  test("合法消息在 allowlist 与 mention 过滤后归一化为 InboundEnvelope", async () => {
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
            message_id: "msg-001",
            message_type: "text",
            content: JSON.stringify({
              text: "@carvis /status",
            }),
            mentions: [
              {
                name: "carvis",
              },
            ],
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
      channel: "feishu",
      sessionKey: "chat-001",
      chatId: "chat-001",
      messageId: "msg-001",
      userId: "user-001",
      command: "status",
      prompt: null,
      rawText: "/status",
    });
  });

  test("allowlist 与 mention 过滤在 channel-feishu 内部完成", async () => {
    const blocked = normalizeFeishuWebsocketEvent(
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
            chat_id: "chat-blocked",
            message_id: "msg-001",
            message_type: "text",
            content: JSON.stringify({
              text: "帮我总结仓库目标",
            }),
          },
        },
      },
      {
        allowFrom: ["chat-001"],
        requireMention: true,
      },
    );

    expect(blocked).toEqual({
      accepted: false,
      code: "FILTERED",
      reason: "chat_not_allowed",
    });
  });

  test("握手失败时暴露 FEISHU_WS_HANDSHAKE_FAILED", async () => {
    const ingress = createFeishuWebsocketIngress({
      appId: "cli_test_app",
      appSecret: "test_app_secret",
      allowFrom: ["*"],
      requireMention: false,
      onEnvelope: async () => {},
      transportFactory: createFeishuWebsocketTestTransport({
        connectError: new Error("dial tcp timeout"),
      }),
    });

    await expect(ingress.start()).rejects.toThrow(FeishuWebsocketHandshakeError);
    await expect(ingress.start()).rejects.toMatchObject({
      code: "FEISHU_WS_HANDSHAKE_FAILED",
    });
  });

  test("未显式注入 transportFactory 时默认使用官方 WSClient", async () => {
    const originalStart = Lark.WSClient.prototype.start;
    const originalClose = Lark.WSClient.prototype.close;
    let started = false;
    let closed = false;

    Lark.WSClient.prototype.start = async function () {
      started = true;
      const client = this as unknown as {
        logger: {
          info(...args: unknown[]): void;
        };
      };
      client.logger.info("[ws]", "ws client ready");
    };
    Lark.WSClient.prototype.close = function () {
      closed = true;
    };

    try {
      const ingress = createFeishuWebsocketIngress({
        appId: "cli_test_app",
        appSecret: "test_app_secret",
        allowFrom: ["*"],
        requireMention: false,
        onEnvelope: async () => {},
      });

      await expect(ingress.start()).resolves.toEqual({ ready: true });
      await expect(ingress.emit({})).rejects.toThrow("emit is only available on test websocket transport");
      await ingress.stop();

      expect(started).toBe(true);
      expect(closed).toBe(true);
    } finally {
      Lark.WSClient.prototype.start = originalStart;
      Lark.WSClient.prototype.close = originalClose;
    }
  });

  test("官方 WSClient 在握手超时后暴露 FEISHU_WS_HANDSHAKE_FAILED", async () => {
    const originalStart = Lark.WSClient.prototype.start;
    const originalClose = Lark.WSClient.prototype.close;

    Lark.WSClient.prototype.start = async function () {};
    Lark.WSClient.prototype.close = function () {};

    try {
      const ingress = createFeishuWebsocketIngress({
        appId: "cli_test_app",
        appSecret: "test_app_secret",
        allowFrom: ["*"],
        handshakeTimeoutMs: 10,
        requireMention: false,
        onEnvelope: async () => {},
      });

      await expect(ingress.start()).rejects.toMatchObject({
        code: "FEISHU_WS_HANDSHAKE_FAILED",
      });
    } finally {
      Lark.WSClient.prototype.start = originalStart;
      Lark.WSClient.prototype.close = originalClose;
    }
  });
});
