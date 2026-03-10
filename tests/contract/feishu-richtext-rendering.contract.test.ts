import { describe, expect, test } from "bun:test";

import { createInMemoryRepositories, createRuntimeLogger } from "@carvis/core";
import { createFeishuRuntimeSender } from "@carvis/channel-feishu";

import { createPresentationOrchestrator } from "../../apps/gateway/src/services/presentation-orchestrator.ts";
import { TEST_AGENT_CONFIG } from "../support/harness.ts";

describe("feishu richtext rendering contract", () => {
  test("presentation run-flow 通过真实 sender 输出稳定卡片结构", async () => {
    const repositories = createInMemoryRepositories();
    const requests: Array<{ method: string; url: string; body: string | undefined }> = [];
    const orchestrator = createPresentationOrchestrator({
      repositories,
      sender: createFeishuRuntimeSender({
        appId: "cli_test_app",
        appSecret: "test_app_secret",
        logger: createRuntimeLogger(),
        fetch: async (input, init) => {
          requests.push({
            method: init?.method ?? "GET",
            url: String(input),
            body: typeof init?.body === "string" ? init.body : undefined,
          });

          if (String(input).includes("tenant_access_token")) {
            return new Response(JSON.stringify({ tenant_access_token: "tenant-token" }), { status: 200 });
          }

          if (init?.method === "POST") {
            return new Response(JSON.stringify({ data: { message_id: "om_card_contract_1" }, code: 0 }), { status: 200 });
          }

          return new Response(JSON.stringify({ code: 0 }), { status: 200 });
        },
      }),
    });

    const session = await repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-1",
      agentConfig: TEST_AGENT_CONFIG,
    });
    const run = await repositories.runs.createQueuedRun({
      sessionId: session.id,
      agentId: TEST_AGENT_CONFIG.id,
      workspace: TEST_AGENT_CONFIG.workspace,
      prompt: "请总结仓库",
      triggerMessageId: "msg-1",
      triggerUserId: "user-1",
      timeoutSeconds: 60,
    });
    await repositories.presentations.createPendingPresentation({
      runId: run.id,
      sessionId: session.id,
      chatId: session.chatId,
    });
    await repositories.runs.markRunStarted(run.id, "2026-03-09T00:00:00.000Z");

    await orchestrator.handleRunStarted({
      runId: run.id,
      chatId: session.chatId,
      title: "运行中",
    });
    await orchestrator.handleOutputDelta({
      runId: run.id,
      sequence: 1,
      text: "# 概览\n```html\n<div>hi</div>\n```",
    });
    await repositories.runs.markRunCompleted(run.id, "2026-03-09T00:00:05.000Z", "已完成");
    await orchestrator.handleTerminalEvent({
      runId: run.id,
      terminalEvent: {
        eventType: "run.completed",
        payload: {
          result_summary: "## 结果\n```html\n<div>hi</div>\n```",
        },
      },
    });

    const createPayload = JSON.parse(requests[1]?.body ?? "{}");
    expect(createPayload.card.elements).toEqual([
      {
        element_id: "carvis-output",
        tag: "div",
        text: {
          tag: "plain_text",
          content: "正在处理",
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
          content: "**概览**",
        },
      },
      {
        element_id: "carvis-output-section-1",
        tag: "div",
        text: {
          tag: "plain_text",
          content: "[html]\n<div>hi</div>",
        },
      },
    ]);

    const completePayload = JSON.parse(requests[3]?.body ?? "{}");
    expect(JSON.parse(completePayload.content).elements).toEqual([
      {
        element_id: "carvis-output",
        tag: "div",
        text: {
          tag: "lark_md",
          content: "**结果**",
        },
      },
      {
        element_id: "carvis-output-section-1",
        tag: "div",
        text: {
          tag: "plain_text",
          content: "[html]\n<div>hi</div>",
        },
      },
    ]);
  });
});
