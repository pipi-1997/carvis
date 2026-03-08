import { describe, expect, test } from "bun:test";

import { FeishuAdapter } from "../../packages/channel-feishu/src/adapter.ts";
import { createFeishuPayload, createSignedHeaders } from "../support/harness.ts";

describe("FeishuAdapter", () => {
  test("将普通消息归一化为运行请求", async () => {
    const adapter = new FeishuAdapter({
      signingSecret: "test-secret",
      sender: {
        addReaction: async () => {},
        removeReaction: async () => {},
        sendMessage: async () => ({ messageId: "delivery-1" }),
      },
    });
    const payload = createFeishuPayload("帮我总结仓库目标");

    const envelope = await adapter.parseInbound(payload);

    expect(envelope.channel).toBe("feishu");
    expect(envelope.sessionKey).toBe("chat-001");
    expect(envelope.command).toBeNull();
    expect(envelope.prompt).toBe("帮我总结仓库目标");
  });

  test("将 /status 识别为命令而不是运行请求", async () => {
    const adapter = new FeishuAdapter({
      signingSecret: "test-secret",
      sender: {
        addReaction: async () => {},
        removeReaction: async () => {},
        sendMessage: async () => ({ messageId: "delivery-1" }),
      },
    });
    const payload = createFeishuPayload("/status");

    const envelope = await adapter.parseInbound(payload);

    expect(envelope.command).toBe("status");
    expect(envelope.prompt).toBeNull();
  });

  test("只接受通过签名校验的 webhook", async () => {
    const adapter = new FeishuAdapter({
      signingSecret: "test-secret",
      sender: {
        addReaction: async () => {},
        removeReaction: async () => {},
        sendMessage: async () => ({ messageId: "delivery-1" }),
      },
    });
    const payload = createFeishuPayload("hello");
    const body = JSON.stringify(payload);

    await expect(
      adapter.verifyWebhook({
        headers: createSignedHeaders(body),
        rawBody: body,
      }),
    ).resolves.toBeTrue();

    await expect(
      adapter.verifyWebhook({
        headers: {
          "x-feishu-request-timestamp": "1700000000",
          "x-feishu-signature": "bad-signature",
        },
        rawBody: body,
      }),
    ).resolves.toBeFalse();
  });
});
