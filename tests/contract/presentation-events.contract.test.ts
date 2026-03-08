import { describe, expect, test } from "bun:test";

import { createInMemoryRepositories } from "@carvis/core";

import { createPresentationOrchestrator } from "../../apps/gateway/src/services/presentation-orchestrator.ts";

describe("presentation event mapping", () => {
  test("run.queued 只创建 pending_start 呈现，不创建过程卡片", async () => {
    const repositories = createInMemoryRepositories();
    const operations: string[] = [];
    const orchestrator = createPresentationOrchestrator({
      repositories,
      sender: {
        async completeCard() {
          operations.push("complete-card");
        },
        async createCard() {
          operations.push("create-card");
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
          operations.push("update-card");
        },
      },
    });

    await orchestrator.handleRunQueued({
      runId: "run-1",
      sessionId: "session-1",
      chatId: "chat-1",
    });

    const presentation = await repositories.presentations.getPresentationByRunId("run-1");
    expect(presentation?.phase).toBe("pending_start");
    expect(presentation?.streamingCardId).toBeNull();
    expect(operations).toEqual([]);
  });

  test("run.started 创建过程卡片，agent.output.delta 更新可见文本", async () => {
    const repositories = createInMemoryRepositories();
    const operations: Array<{ action: string; text?: string }> = [];
    const orchestrator = createPresentationOrchestrator({
      repositories,
      sender: {
        async completeCard() {
          operations.push({ action: "complete-card" });
        },
        async createCard() {
          operations.push({ action: "create-card" });
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
        async updateCard(input) {
          operations.push({ action: "update-card", text: input.text });
        },
      },
    });

    await orchestrator.handleRunQueued({
      runId: "run-1",
      sessionId: "session-1",
      chatId: "chat-1",
    });
    await orchestrator.handleRunStarted({
      runId: "run-1",
      chatId: "chat-1",
      title: "运行中",
    });
    await orchestrator.handleOutputDelta({
      runId: "run-1",
      sequence: 1,
      text: "正在分析仓库",
    });

    const presentation = await repositories.presentations.getPresentationByRunId("run-1");
    expect(presentation?.phase).toBe("streaming");
    expect(presentation?.streamingCardId).toBe("card-1");
    expect(presentation?.lastOutputSequence).toBe(1);
    expect(presentation?.lastOutputExcerpt).toBe("正在分析仓库");
    expect(operations).toEqual([
      { action: "create-card" },
      { action: "update-card", text: "正在分析仓库" },
    ]);
  });
});
