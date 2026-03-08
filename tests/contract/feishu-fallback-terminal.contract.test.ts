import { describe, expect, test } from "bun:test";

import { createInMemoryRepositories } from "@carvis/core";

import { createPresentationOrchestrator } from "../../apps/gateway/src/services/presentation-orchestrator.ts";
import { TEST_AGENT_CONFIG } from "../support/harness.ts";

describe("fallback terminal contract", () => {
  test("过程卡片已成功创建后，即使后续更新失败也不得补发第二条终态消息", async () => {
    const repositories = createInMemoryRepositories();
    const operations: string[] = [];
    const orchestrator = createPresentationOrchestrator({
      repositories,
      sender: {
        async completeCard() {
          operations.push("complete-card");
        },
        async createCard() {
          return {
            messageId: "message-1",
            cardId: "card-1",
            elementId: "element-1",
          };
        },
        async sendFallbackTerminal() {
          operations.push("send-fallback-terminal");
          return { messageId: "fallback-terminal-1" };
        },
        async updateCard() {
          throw new Error("patch failed");
        },
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
    await repositories.runs.markRunStarted(run.id, "2026-03-09T00:00:00.000Z");
    await orchestrator.handleOutputDelta({
      runId: run.id,
      sequence: 1,
      text: "第一段输出",
    });
    await repositories.runs.markRunFailed(run.id, "2026-03-09T00:00:05.000Z", "bridge_error", "patch failed");

    await orchestrator.handleTerminalEvent({
      runId: run.id,
      terminalEvent: {
        eventType: "run.failed",
        payload: {
          failure_code: "bridge_error",
          failure_message: "patch failed",
        },
      },
    });

    const presentation = await repositories.presentations.getPresentationByRunId(run.id);
    expect(presentation?.phase).toBe("failed");
    expect(presentation?.terminalStatus).toBe("failed");
    expect(operations).toEqual(["complete-card"]);
  });

  test("只有过程卡片创建失败且用户尚无交付时才发送终态兜底消息", async () => {
    const repositories = createInMemoryRepositories();
    const operations: string[] = [];
    const orchestrator = createPresentationOrchestrator({
      repositories,
      sender: {
        async completeCard() {
          operations.push("complete-card");
        },
        async createCard() {
          throw new Error("create failed");
        },
        async sendFallbackTerminal() {
          operations.push("send-fallback-terminal");
          return { messageId: "fallback-terminal-1" };
        },
        async updateCard() {
          operations.push("update-card");
        },
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
    await repositories.runs.markRunStarted(run.id, "2026-03-09T00:00:00.000Z");
    await orchestrator.handleRunStarted({
      runId: run.id,
      chatId: session.chatId,
      title: "运行中",
    });
    await repositories.runs.markRunFailed(run.id, "2026-03-09T00:00:05.000Z", "bridge_error", "create failed");

    await orchestrator.handleTerminalEvent({
      runId: run.id,
      terminalEvent: {
        eventType: "run.failed",
        payload: {
          failure_code: "bridge_error",
          failure_message: "create failed",
        },
      },
    });

    const presentation = await repositories.presentations.getPresentationByRunId(run.id);
    expect(presentation?.phase).toBe("degraded");
    expect(operations).toEqual(["send-fallback-terminal"]);
  });
});
