import { describe, expect, test } from "bun:test";

import { createFeishuRuntimeSender } from "@carvis/channel-feishu/runtime-sender";
import { createScriptedCodexTransport } from "@carvis/bridge-codex/bridge";
import type { RunEvent } from "@carvis/core/domain";

import { createHarness } from "../support/harness.ts";

describe("presentation setup", () => {
  test("workspace packages expose subpath exports needed by feature 003 tests", () => {
    expect(typeof createFeishuRuntimeSender).toBe("function");
    expect(typeof createScriptedCodexTransport).toBe("function");

    const event: RunEvent = {
      id: "event-1",
      runId: "run-1",
      eventType: "run.started",
      payload: {},
      createdAt: new Date().toISOString(),
    };

    expect(event.eventType).toBe("run.started");
  });

  test("test harness captures reaction, card and fallback terminal presentation operations", async () => {
    const harness = createHarness();

    await harness.adapter.addReaction("msg-1", "OK");
    await harness.adapter.sendMessage({
      chatId: "chat-1",
      runId: "run-1",
      kind: "result",
      content: "最终文本",
    });

    await harness.presentationSender.createCard({
      chatId: "chat-1",
      runId: "run-1",
      title: "运行中",
      body: "正在处理",
    });
    await harness.presentationSender.updateCard({
      cardId: "card-1",
      elementId: "element-1",
      runId: "run-1",
      text: "增量输出",
    });
    await harness.presentationSender.sendFallbackTerminal({
      chatId: "chat-1",
      runId: "run-1",
      title: "结果",
      content: "结论",
    });

    expect(harness.reactionOperations).toEqual([
      {
        action: "add",
        emojiType: "OK",
        messageId: "msg-1",
      },
    ]);
    expect(harness.sentMessages).toEqual([
      expect.objectContaining({
        chatId: "chat-1",
        content: "最终文本",
        kind: "result",
      }),
    ]);
    expect(harness.presentationOperations).toEqual([
      expect.objectContaining({
        action: "create-card",
        chatId: "chat-1",
        runId: "run-1",
      }),
      expect.objectContaining({
        action: "update-card",
        cardId: "card-1",
        runId: "run-1",
      }),
      expect.objectContaining({
        action: "send-fallback-terminal",
        chatId: "chat-1",
        runId: "run-1",
      }),
    ]);
  });
});
