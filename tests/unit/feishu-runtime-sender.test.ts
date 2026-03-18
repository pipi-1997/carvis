import { describe, expect, test } from "bun:test";

import { createFeishuRuntimeSender, FeishuMediaStageError } from "@carvis/channel-feishu";
import { createRuntimeLogger, type OutboundMessage } from "@carvis/core";

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

  test("上传图片并发送 image 消息", async () => {
    const requests: Array<{ url: string; method: string; body?: string; contentType?: string | null }> = [];
    const sender = createFeishuRuntimeSender({
      appId: "cli_test_app",
      appSecret: "test_app_secret",
      fetch: async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? init.body : undefined,
          contentType: init?.headers instanceof Headers
            ? init.headers.get("Content-Type")
            : null,
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
                image_key: "img-key-001",
              },
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            data: {
              message_id: "om_img_1",
            },
          }),
          { status: 200 },
        );
      },
    });

    const result = await sender.sendImage({
      chatId: "oc_test_chat",
      runId: "run-image",
      fileName: "result.png",
      content: new Uint8Array([1, 2, 3]),
    });

    expect(result).toEqual({
      messageId: "om_img_1",
      targetRef: "img-key-001",
    });
    expect(requests).toHaveLength(3);
    expect(requests[1]?.url).toContain("/open-apis/im/v1/images");
    expect(requests[2]?.url).toContain("/message/v4/send");
    expect(JSON.parse(requests[2]?.body ?? "{}")).toEqual({
      chat_id: "oc_test_chat",
      msg_type: "image",
      content: {
        image_key: "img-key-001",
      },
    });
  });

  test("上传文件并发送 file 消息", async () => {
    const requests: Array<{ url: string; method: string; body?: string; contentType?: string | null }> = [];
    const sender = createFeishuRuntimeSender({
      appId: "cli_test_app",
      appSecret: "test_app_secret",
      fetch: async (input, init) => {
        requests.push({
          url: String(input),
          method: init?.method ?? "GET",
          body: typeof init?.body === "string" ? init.body : undefined,
          contentType: init?.headers instanceof Headers
            ? init.headers.get("Content-Type")
            : null,
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
                file_key: "file-key-001",
              },
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            data: {
              message_id: "om_file_1",
            },
          }),
          { status: 200 },
        );
      },
    });

    const result = await sender.sendFile({
      chatId: "oc_test_chat",
      runId: "run-file",
      fileName: "report.pdf",
      content: new Uint8Array([1, 2, 3]),
    });

    expect(result).toEqual({
      messageId: "om_file_1",
      targetRef: "file-key-001",
    });
    expect(requests).toHaveLength(3);
    expect(requests[1]?.url).toContain("/open-apis/im/v1/files");
    expect(requests[2]?.url).toContain("/message/v4/send");
    expect(JSON.parse(requests[2]?.body ?? "{}")).toEqual({
      chat_id: "oc_test_chat",
      msg_type: "file",
      content: {
        file_key: "file-key-001",
      },
    });
  });

  test("上传阶段失败时抛出 upload stage 错误", async () => {
    let requestCount = 0;
    const sender = createFeishuRuntimeSender({
      appId: "cli_test_app",
      appSecret: "test_app_secret",
      fetch: async (_input, _init) => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Response(
            JSON.stringify({
              tenant_access_token: "tenant-token",
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            msg: "upload broken",
          }),
          { status: 500 },
        );
      },
    });

    try {
      await sender.uploadImage({
        chatId: "oc_test_chat",
        runId: "run-upload-failed",
        fileName: "result.png",
        content: new Uint8Array([1, 2, 3]),
      });
      throw new Error("expected upload to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FeishuMediaStageError);
      expect(error).toMatchObject({
        stage: "upload",
        message: "upload broken",
      });
    }
  });

  test("最终发送阶段失败时抛出 delivery stage 错误", async () => {
    let requestCount = 0;
    const sender = createFeishuRuntimeSender({
      appId: "cli_test_app",
      appSecret: "test_app_secret",
      fetch: async (_input, _init) => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Response(
            JSON.stringify({
              tenant_access_token: "tenant-token",
            }),
            { status: 200 },
          );
        }

        return new Response(
          JSON.stringify({
            msg: "send broken",
          }),
          { status: 500 },
        );
      },
    });

    try {
      await sender.deliverFile({
        chatId: "oc_test_chat",
        runId: "run-delivery-failed",
        targetRef: "file-key-001",
      });
      throw new Error("expected delivery to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FeishuMediaStageError);
      expect(error).toMatchObject({
        stage: "delivery",
        message: "send broken",
      });
    }
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
              tag: "plain_text",
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
            tag: "plain_text",
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
            content: "**结论**",
            tag: "lark_md",
          },
        },
        {
          element_id: "carvis-output-section-1",
          tag: "div",
          text: {
            content: "已完成",
            tag: "plain_text",
          },
        },
        {
          tag: "hr",
        },
        {
          element_id: "carvis-output-section-2",
          tag: "div",
          text: {
            content: "**验证**",
            tag: "lark_md",
          },
        },
        {
          element_id: "carvis-output-section-3",
          tag: "div",
          text: {
            content: "• bun test",
            tag: "plain_text",
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

  test("终态卡片会把 markdown 二级标题归一化为稳定文本分段", async () => {
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
            content: "**结论**",
            tag: "lark_md",
          },
        },
        {
          element_id: "carvis-output-section-1",
          tag: "div",
          text: {
            content: "命令失败",
            tag: "plain_text",
          },
        },
        {
          tag: "hr",
        },
        {
          element_id: "carvis-output-section-2",
          tag: "div",
          text: {
            content: "**下一步**",
            tag: "lark_md",
          },
        },
        {
          element_id: "carvis-output-section-3",
          tag: "div",
          text: {
            content: "1. 重试",
            tag: "plain_text",
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

  test("运行中卡片会把标题、列表、代码和图片转换成稳定可读文本", async () => {
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
          return new Response(JSON.stringify({ tenant_access_token: "tenant-token" }), { status: 200 });
        }

        if (requests.length === 2) {
          return new Response(JSON.stringify({ data: { message_id: "om_card_3" } }), { status: 200 });
        }

        return new Response(JSON.stringify({ code: 0 }), { status: 200 });
      },
    });

    const created = await sender.createCard({
      chatId: "oc_test_chat",
      runId: "run-3",
      title: "运行中",
      body: "# 概览\n\n- **加粗**\n> 引用\n![图](https://example.com/demo.png)\n<div>bad</div>",
    });

    await sender.updateCard({
      cardId: created.cardId,
      elementId: created.elementId,
      runId: "run-3",
      text: "## 输出\n\n```bash\nbun test",
    });

    const createPayload = JSON.parse(requests[1]?.body ?? "{}");
    expect(createPayload.card.elements).toEqual([
      {
        element_id: "carvis-output",
        tag: "div",
        text: {
          tag: "lark_md",
          content: "**概览**\n\n• **加粗**\n│ 引用\n[图片: 图](https://example.com/demo.png)\n&lt;div&gt;bad&lt;/div&gt;",
        },
      },
    ]);

    const updatePayload = JSON.parse(requests[2]?.body ?? "{}");
    expect(JSON.parse(updatePayload.content).elements).toEqual([
      {
        element_id: "carvis-output",
        tag: "div",
        text: {
          tag: "lark_md",
          content: "**输出**",
        },
      },
      {
        element_id: "carvis-output-section-1",
        tag: "div",
        text: {
          tag: "plain_text",
          content: "[bash]\nbun test",
        },
      },
    ]);
  });

  test("sender 会为加粗和链接保留受控 lark_md，而代码块仍使用 plain_text", async () => {
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
          return new Response(JSON.stringify({ tenant_access_token: "tenant-token" }), { status: 200 });
        }

        return new Response(JSON.stringify({ data: { message_id: "om_card_md" }, code: 0 }), { status: 200 });
      },
    });

    await sender.createCard({
      chatId: "oc_test_chat",
      runId: "run-md",
      title: "运行中",
      body: [
        "# 样式",
        "",
        "- **加粗项**",
        "[文档链接](https://example.com/docs)",
        "https://example.com/raw-link",
        "![架构图](https://example.com/a.png)",
        "",
        "```bash",
        "bun test",
        "```",
      ].join("\n"),
    });

    const createPayload = JSON.parse(requests[1]?.body ?? "{}");
    expect(createPayload.card.elements).toEqual([
      {
        element_id: "carvis-output",
        tag: "div",
        text: {
          tag: "lark_md",
          content: [
            "**样式**",
            "",
            "• **加粗项**",
            "[文档链接](https://example.com/docs)",
            "[https://example.com/raw-link](https://example.com/raw-link)",
            "[图片: 架构图](https://example.com/a.png)",
          ].join("\n"),
        },
      },
      {
        element_id: "carvis-output-section-1",
        tag: "div",
        text: {
          tag: "plain_text",
          content: "[bash]\nbun test",
        },
      },
    ]);
  });

  test("sender 会输出 normalized 与 degraded 的结构化日志", async () => {
    const logger = createRuntimeLogger();
    const sender = createFeishuRuntimeSender({
      appId: "cli_test_app",
      appSecret: "test_app_secret",
      logger,
      fetch: async (input) => {
        if (String(input).includes("tenant_access_token")) {
          return new Response(JSON.stringify({ tenant_access_token: "tenant-token" }), { status: 200 });
        }

        return new Response(JSON.stringify({ data: { message_id: "om_card_4" }, code: 0 }), { status: 200 });
      },
    });

    const created = await sender.createCard({
      chatId: "oc_test_chat",
      runId: "run-4",
      title: "运行中",
      body: "# 标题",
    });

    await sender.updateCard({
      cardId: created.cardId,
      elementId: created.elementId,
      runId: "run-4",
      text: "<div>bad</div>",
    });

    expect(logger.listEntries()).toContainEqual({
      level: "info",
      message: "presentation.feishu.normalized",
      context: {
        mode: "streaming",
        outcome: "normalized",
        role: "gateway",
        runId: "run-4",
      },
    });
    expect(logger.listEntries()).toContainEqual({
      level: "warn",
      message: "presentation.feishu.degraded",
      context: {
        degradedFragments: ["div"],
        mode: "streaming",
        outcome: "degraded",
        role: "gateway",
        runId: "run-4",
      },
    });
  });

  test("sender 会沿用 logger 的 presentation 角色标记", async () => {
    const logger = createRuntimeLogger();
    const sender = createFeishuRuntimeSender({
      appId: "cli_test_app",
      appSecret: "test_app_secret",
      logger,
      presentationRole: "executor",
      fetch: async (input) => {
        if (String(input).includes("tenant_access_token")) {
          return new Response(JSON.stringify({ tenant_access_token: "tenant-token" }), { status: 200 });
        }

        return new Response(JSON.stringify({ data: { message_id: "om_card_5" }, code: 0 }), { status: 200 });
      },
    });

    await sender.createCard({
      chatId: "oc_test_chat",
      runId: "run-5",
      title: "运行中",
      body: "# 标题",
    });

    expect(logger.listEntries()).toContainEqual({
      level: "info",
      message: "presentation.feishu.normalized",
      context: {
        mode: "streaming",
        outcome: "normalized",
        role: "executor",
        runId: "run-5",
      },
    });
  });

  test("createCard 实际发送失败时会记录 card_create_failed", async () => {
    const logger = createRuntimeLogger();
    const sender = createFeishuRuntimeSender({
      appId: "cli_test_app",
      appSecret: "test_app_secret",
      logger,
      fetch: async (input) => {
        if (String(input).includes("tenant_access_token")) {
          return new Response(JSON.stringify({ tenant_access_token: "tenant-token" }), { status: 200 });
        }

        return new Response(JSON.stringify({ msg: "feishu create failed" }), { status: 500 });
      },
    });

    await expect(
      sender.createCard({
        chatId: "oc_test_chat",
        runId: "run-create-failed",
        title: "运行中",
        body: "# 标题",
      }),
    ).rejects.toThrow("feishu create failed");

    expect(logger.listEntries()).toContainEqual({
      level: "warn",
      message: "presentation.feishu.card_create_failed",
      context: {
        mode: "streaming",
        reason: "feishu create failed",
        role: "gateway",
        runId: "run-create-failed",
      },
    });
  });

  test("updateCard 因 invalid access token 自动重试成功时不记录 card_update_failed", async () => {
    const logger = createRuntimeLogger();
    let tokenRequests = 0;
    const sender = createFeishuRuntimeSender({
      appId: "cli_test_app",
      appSecret: "test_app_secret",
      logger,
      fetch: async (input, init) => {
        if (String(input).includes("tenant_access_token")) {
          tokenRequests += 1;
          return new Response(JSON.stringify({ tenant_access_token: tokenRequests === 1 ? "stale-token" : "fresh-token" }), {
            status: 200,
          });
        }

        const authHeader = init?.headers instanceof Headers
          ? init.headers.get("Authorization")
          : Array.isArray(init?.headers)
            ? null
            : typeof init?.headers === "object" && init?.headers
              ? String(Reflect.get(init.headers, "Authorization") ?? "")
              : null;
        if (authHeader === "Bearer stale-token") {
          return new Response(JSON.stringify({ code: 99991663, msg: "invalid access token" }), { status: 401 });
        }

        return new Response(JSON.stringify({ code: 0 }), { status: 200 });
      },
    });

    await sender.updateCard({
      cardId: "om_card_retry",
      elementId: "carvis-output",
      runId: "run-update-retry",
      text: "# 标题",
    });

    expect(logger.listEntries()).toContainEqual({
      level: "info",
      message: "presentation.feishu.normalized",
      context: {
        mode: "streaming",
        outcome: "normalized",
        role: "gateway",
        runId: "run-update-retry",
      },
    });
    expect(logger.listEntries().some((entry) => entry.message === "presentation.feishu.card_update_failed")).toBe(false);
  });

  test("completeCard 因 invalid access token 自动重试成功时不记录 card_complete_failed", async () => {
    const logger = createRuntimeLogger();
    let tokenRequests = 0;
    const sender = createFeishuRuntimeSender({
      appId: "cli_test_app",
      appSecret: "test_app_secret",
      logger,
      fetch: async (input, init) => {
        if (String(input).includes("tenant_access_token")) {
          tokenRequests += 1;
          return new Response(JSON.stringify({ tenant_access_token: tokenRequests === 1 ? "stale-token" : "fresh-token" }), {
            status: 200,
          });
        }

        const authHeader = init?.headers instanceof Headers
          ? init.headers.get("Authorization")
          : Array.isArray(init?.headers)
            ? null
            : typeof init?.headers === "object" && init?.headers
              ? String(Reflect.get(init.headers, "Authorization") ?? "")
              : null;
        if (authHeader === "Bearer stale-token") {
          return new Response(JSON.stringify({ code: 99991663, msg: "invalid access token" }), { status: 401 });
        }

        return new Response(JSON.stringify({ code: 0 }), { status: 200 });
      },
    });

    await sender.completeCard({
      cardId: "om_card_retry",
      elementId: "carvis-output",
      runId: "run-complete-retry",
      status: "completed",
      title: "已完成",
      body: "# 结果",
    });

    expect(logger.listEntries()).toContainEqual({
      level: "info",
      message: "presentation.feishu.normalized",
      context: {
        mode: "terminal",
        outcome: "normalized",
        role: "gateway",
        runId: "run-complete-retry",
      },
    });
    expect(logger.listEntries().some((entry) => entry.message === "presentation.feishu.card_complete_failed")).toBe(false);
  });

  test("sendFallbackTerminal 发送失败时不应预先记录 fallback_terminal 成功日志", async () => {
    const logger = createRuntimeLogger();
    const sender = createFeishuRuntimeSender({
      appId: "cli_test_app",
      appSecret: "test_app_secret",
      logger,
      fetch: async (input) => {
        if (String(input).includes("tenant_access_token")) {
          return new Response(JSON.stringify({ tenant_access_token: "tenant-token" }), { status: 200 });
        }

        throw new Error("fallback send failed");
      },
    });

    await expect(
      sender.sendFallbackTerminal({
        chatId: "oc_test_chat",
        runId: "run-fallback-failed",
        title: "结果摘要",
        content: "内容",
      }),
    ).rejects.toThrow("fallback send failed");

    expect(logger.listEntries().some((entry) => entry.message === "presentation.feishu.fallback_terminal")).toBe(false);
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
