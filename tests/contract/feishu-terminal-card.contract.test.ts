import { describe, expect, test } from "bun:test";

import { createInMemoryRepositories } from "@carvis/core";

import { createPresentationOrchestrator } from "../../apps/gateway/src/services/presentation-orchestrator.ts";
import { TEST_AGENT_CONFIG } from "../support/harness.ts";

describe("terminal card contract", () => {
  test("运行完成后切换为完成态摘要卡且不再发送第二条成功消息", async () => {
    const repositories = createInMemoryRepositories();
    const operations: Array<{ action: string; body?: string; status?: string; title?: string }> = [];
    const orchestrator = createPresentationOrchestrator({
      repositories,
      sender: {
        async completeCard(input) {
          operations.push({
            action: "complete-card",
            body: input.body,
            status: input.status,
            title: input.title,
          });
        },
        async createCard() {
          return {
            messageId: "message-1",
            cardId: "card-1",
            elementId: "element-1",
          };
        },
        async sendFallbackTerminal() {
          operations.push({ action: "send-fallback-terminal" });
          return { messageId: "fallback-terminal-1" };
        },
        async updateCard() {},
      },
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
    await repositories.presentations.markPresentationStreaming({
      runId: run.id,
      streamingMessageId: "message-1",
      streamingCardId: "card-1",
      streamingElementId: "element-1",
    });
    await repositories.presentations.updatePresentationOutput({
      runId: run.id,
      lastOutputSequence: 2,
      lastOutputExcerpt: "正在修改文件",
    });
    await repositories.runs.markRunStarted(run.id, "2026-03-09T00:00:00.000Z");
    await repositories.runs.markRunCompleted(run.id, "2026-03-09T00:00:05.000Z", "已完成");

    await orchestrator.handleTerminalEvent({
      runId: run.id,
      terminalEvent: {
        eventType: "run.completed",
        payload: {
          result_summary: "已完成",
        },
      },
    });

    const presentation = await repositories.presentations.getPresentationByRunId(run.id);
    expect(presentation?.phase).toBe("completed");
    expect(presentation?.terminalStatus).toBe("completed");
    expect(operations).toEqual([
      expect.objectContaining({
        action: "complete-card",
        status: "completed",
        title: "已完成",
      }),
    ]);
  });
});
