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

  test("收到 invalid access token 后会刷新 tenant token 并重试一次", async () => {
    const requests: Array<{ url: string; method: string; body: string | undefined; auth?: string | null }> = [];
    const sender = createFeishuRuntimeSender({
      appId: "cli_test_app",
      appSecret: "test_app_secret",
      fetch: async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? init.body : undefined,
          auth: init?.headers instanceof Headers
            ? init.headers.get("Authorization")
            : Array.isArray(init?.headers)
              ? null
              : typeof init?.headers === "object" && init?.headers
                ? String(Reflect.get(init.headers, "Authorization") ?? "")
                : null,
        });

        if (requests.length === 1) {
          return new Response(
            JSON.stringify({
              tenant_access_token: "stale-token",
            }),
            { status: 200 },
          );
        }

        if (requests.length === 2) {
          return new Response(
            JSON.stringify({
              code: 99991663,
              msg: "Invalid access token for authorization. Please make a request with token attached.",
            }),
            { status: 401 },
          );
        }

        if (requests.length === 3) {
          return new Response(
            JSON.stringify({
              tenant_access_token: "fresh-token",
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            data: {
              message_id: "om_retry_ok",
            },
          }),
          { status: 200 },
        );
      },
    });

    const result = await sender.sendMessage({
      chatId: "oc_test_chat",
      runId: "run-retry",
      kind: "result",
      content: "重试成功",
    } satisfies OutboundMessage);

    expect(result).toEqual({ messageId: "om_retry_ok" });
    expect(requests).toHaveLength(4);
    expect(requests[1]?.auth).toBe("Bearer stale-token");
    expect(requests[3]?.auth).toBe("Bearer fresh-token");
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

  test("发送运行中 interactive 卡片、更新输出区域并切换为终态摘要卡", async () => {
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
              data: {
                message_id: "om_card_1",
              },
            }),
            { status: 200 },
          );
        }

        if (requests.length === 3) {
          return new Response(
            JSON.stringify({
              code: 0,
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            code: 0,
          }),
          { status: 200 },
        );
      },
    });

    const created = await sender.createCard({
      chatId: "oc_test_chat",
      runId: "run-1",
      title: "运行中",
      body: "正在处理",
    });
    await sender.updateCard({
      cardId: created.cardId,
      elementId: created.elementId,
      runId: "run-1",
      text: "最新输出",
    });
    await sender.completeCard({
      cardId: created.cardId,
      elementId: created.elementId,
      runId: "run-1",
      status: "completed",
      title: "运行已完成",
      body: "## 结论\n已完成\n\n## 验证\n- bun test",
    });

    expect(created).toEqual({
      messageId: "om_card_1",
      cardId: "om_card_1",
      elementId: "carvis-output",
    });
    expect(requests).toHaveLength(4);
    expect(requests[1]?.url).toContain("/message/v4/send");
    expect(JSON.parse(requests[1]?.body ?? "{}")).toEqual({
      chat_id: "oc_test_chat",
      msg_type: "interactive",
      card: {
        config: {
          update_multi: true,
          wide_screen_mode: true,
        },
        elements: [
          {
            element_id: "carvis-output",
            tag: "div",
            text: {
              content: "正在处理",
              tag: "lark_md",
            },
          },
        ],
        header: {
          template: "blue",
          title: {
            content: "运行中",
            tag: "plain_text",
          },
        },
      },
    });
    expect(requests[2]?.url).toContain("/im/v1/messages/om_card_1");
    expect(requests[2]?.method).toBe("PATCH");
    const updatePayload = JSON.parse(requests[2]?.body ?? "{}");
    expect(JSON.parse(updatePayload.content)).toEqual({
      config: {
        update_multi: true,
        wide_screen_mode: true,
      },
      elements: [
        {
          element_id: "carvis-output",
          tag: "div",
          text: {
            content: "最新输出",
            tag: "lark_md",
          },
        },
      ],
      header: {
        template: "blue",
        title: {
          content: "运行中",
          tag: "plain_text",
        },
      },
    });
    expect(requests[3]?.url).toContain("/im/v1/messages/om_card_1");
    expect(requests[3]?.method).toBe("PATCH");
    const completePayload = JSON.parse(requests[3]?.body ?? "{}");
    expect(JSON.parse(completePayload.content)).toEqual({
      config: {
        update_multi: true,
        wide_screen_mode: true,
      },
      elements: [
        {
          element_id: "carvis-output",
          tag: "div",
          text: {
            content: "**结论**\n已完成",
            tag: "lark_md",
          },
        },
        {
          tag: "hr",
        },
        {
          element_id: "carvis-output-section-1",
          tag: "div",
          text: {
            content: "**验证**\n- bun test",
            tag: "lark_md",
          },
        },
      ],
      header: {
        template: "green",
        title: {
          content: "运行已完成",
          tag: "plain_text",
        },
      },
    });
  });

  test("终态卡片会把 markdown 二级标题归一化为 lark_md 分段", async () => {
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
              data: {
                message_id: "om_card_2",
              },
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            code: 0,
          }),
          { status: 200 },
        );
      },
    });

    const created = await sender.createCard({
      chatId: "oc_test_chat",
      runId: "run-2",
      title: "运行中",
      body: "准备中",
    });

    await sender.completeCard({
      cardId: created.cardId,
      elementId: created.elementId,
      runId: "run-2",
      status: "failed",
      title: "运行失败",
      body: "## 结论\n命令失败\n\n## 下一步\n1. 重试",
    });

    const completePayload = JSON.parse(requests[2]?.body ?? "{}");
    expect(JSON.parse(completePayload.content)).toEqual({
      config: {
        update_multi: true,
        wide_screen_mode: true,
      },
      elements: [
        {
          element_id: "carvis-output",
          tag: "div",
          text: {
            content: "**结论**\n命令失败",
            tag: "lark_md",
          },
        },
        {
          tag: "hr",
        },
        {
          element_id: "carvis-output-section-1",
          tag: "div",
          text: {
            content: "**下一步**\n1. 重试",
            tag: "lark_md",
          },
        },
      ],
      header: {
        template: "red",
        title: {
          content: "运行失败",
          tag: "plain_text",
        },
      },
    });
  });

  test("发送结构化 post 富文本结果", async () => {
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
              message_id: "om_post_1",
            },
          }),
          { status: 200 },
        );
      },
    });

    const result = await sender.sendFallbackTerminal({
      chatId: "oc_test_chat",
      runId: "run-1",
      title: "结果摘要",
      content: "结论\n- 已完成",
    });

    expect(result).toEqual({ messageId: "om_post_1" });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.url).toContain("/message/v4/send");
    expect(JSON.parse(requests[1]?.body ?? "{}")).toEqual({
      chat_id: "oc_test_chat",
      msg_type: "post",
      content: {
        post: {
          zh_cn: {
            content: [
              [
                {
                  tag: "text",
                  text: "结论\n- 已完成",
                },
              ],
            ],
            title: "结果摘要",
          },
        },
      },
    });
  });
});
