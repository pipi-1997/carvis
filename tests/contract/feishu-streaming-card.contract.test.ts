import { describe, expect, test } from "bun:test";

import { FeishuAdapter } from "../../packages/channel-feishu/src/adapter.ts";

describe("FeishuAdapter presentation contract", () => {
  test("委托创建运行中卡片、更新卡片、终态卡片和发送 fallback terminal 消息", async () => {
    const operations: Array<{ action: string; payload: unknown }> = [];
    const adapter = new FeishuAdapter({
      signingSecret: "test-secret",
      sender: {
        addReaction: async () => {},
        removeReaction: async () => {},
        sendMessage: async () => ({ messageId: "delivery-1" }),
        createCard: async (input) => {
          operations.push({ action: "create-card", payload: input });
          return {
            messageId: "message-1",
            cardId: "card-1",
            elementId: "element-1",
          };
        },
        completeCard: async (input) => {
          operations.push({ action: "complete-card", payload: input });
        },
        updateCard: async (input) => {
          operations.push({ action: "update-card", payload: input });
        },
        sendFallbackTerminal: async (input) => {
          operations.push({ action: "send-fallback-terminal", payload: input });
          return { messageId: "fallback-terminal-1" };
        },
      },
    });

    const created = await adapter.createCard({
      chatId: "chat-1",
      runId: "run-1",
      title: "运行中",
      body: "正在处理",
    });
    await adapter.updateCard({
      cardId: created.cardId,
      elementId: created.elementId,
      runId: "run-1",
      text: "增量输出",
    });
    await adapter.completeCard({
      cardId: created.cardId,
      elementId: created.elementId,
      runId: "run-1",
      status: "completed",
      title: "运行已完成",
      body: "最终摘要",
    });
    const fallback = await adapter.sendFallbackTerminal({
      chatId: "chat-1",
      runId: "run-1",
      title: "完成",
      content: "结论",
    });

    expect(created).toEqual({
      messageId: "message-1",
      cardId: "card-1",
      elementId: "element-1",
    });
    expect(fallback).toEqual({ messageId: "fallback-terminal-1" });
    expect(operations).toEqual([
      {
        action: "create-card",
        payload: {
          body: "正在处理",
          chatId: "chat-1",
          runId: "run-1",
          title: "运行中",
        },
      },
      {
        action: "update-card",
        payload: {
          cardId: "card-1",
          elementId: "element-1",
          runId: "run-1",
          text: "增量输出",
        },
      },
      {
        action: "complete-card",
        payload: {
          body: "最终摘要",
          cardId: "card-1",
          elementId: "element-1",
          runId: "run-1",
          status: "completed",
          title: "运行已完成",
        },
      },
      {
        action: "send-fallback-terminal",
        payload: {
          chatId: "chat-1",
          content: "结论",
          runId: "run-1",
          title: "完成",
        },
      },
    ]);
  });
});
