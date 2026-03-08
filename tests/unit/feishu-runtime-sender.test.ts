import { describe, expect, test } from "bun:test";

import { createFeishuRuntimeSender } from "@carvis/channel-feishu";
import type { OutboundMessage } from "@carvis/core";

describe("feishu runtime sender", () => {
  test("使用 appId/appSecret 换取 token 并发送消息", async () => {
    const requests: Array<{ url: string; method: string; body: string | undefined }> = [];
    const sender = createFeishuRuntimeSender({
      appId: "cli_test_app",
      appSecret: "test_app_secret",
      fetch: async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? init.body : undefined,
        });

        if (requests.length === 1) {
          return new Response(
            JSON.stringify({
              tenant_access_token: "tenant-token",
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            data: {
              message_id: "om_xxx",
            },
          }),
          { status: 200 },
        );
      },
    });

    const result = await sender.sendMessage({
      chatId: "oc_test_chat",
      runId: "run-1",
      kind: "result",
      content: "完成",
    } satisfies OutboundMessage);

    expect(result.messageId).toBe("om_xxx");
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toContain("tenant_access_token");
    expect(requests[1]?.url).toContain("message/v4/send");
    expect(JSON.parse(requests[1]?.body ?? "{}")).toEqual({
      chat_id: "oc_test_chat",
      msg_type: "text",
      content: {
        text: "完成",
      },
    });
  });

  test("对原消息添加并移除工作中表情", async () => {
    const requests: Array<{ url: string; method: string; body: string | undefined }> = [];
    const sender = createFeishuRuntimeSender({
      appId: "cli_test_app",
      appSecret: "test_app_secret",
      fetch: async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? init.body : undefined,
        });

        if (requests.length === 1) {
          return new Response(
            JSON.stringify({
              tenant_access_token: "tenant-token",
            }),
            { status: 200 },
          );
        }

        if (requests.length === 2) {
          return new Response(
            JSON.stringify({
              code: 0,
              data: {
                reaction_id: "reaction-001",
              },
            }),
            { status: 200 },
          );
        }

        if (requests.length === 3) {
          return new Response(
            JSON.stringify({
              code: 0,
              data: {
                items: [
                  {
                    reaction_id: "reaction-001",
                    operator: {
                      operator_id: "app-001",
                      operator_type: "app",
                    },
                    reaction_type: {
                      emoji_type: "OK",
                    },
                  },
                ],
              },
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              reaction_id: "reaction-001",
            },
          }),
          { status: 200 },
        );
      },
    });

    await sender.addReaction("om_test_message", "OK");
    await sender.removeReaction("om_test_message", "OK");

    expect(requests).toHaveLength(4);
    expect(requests[1]?.url).toContain("/im/v1/messages/om_test_message/reactions");
    expect(requests[1]?.method).toBe("POST");
    expect(JSON.parse(requests[1]?.body ?? "{}")).toEqual({
      reaction_type: {
        emoji_type: "OK",
      },
    });
    expect(requests[2]?.url).toContain("/im/v1/messages/om_test_message/reactions");
    expect(requests[2]?.method).toBe("GET");
    expect(requests[3]?.url).toContain("/im/v1/messages/om_test_message/reactions/reaction-001");
    expect(requests[3]?.method).toBe("DELETE");
  });
});
