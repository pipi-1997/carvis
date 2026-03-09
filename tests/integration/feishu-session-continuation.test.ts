import { describe, expect, test } from "bun:test";

import type { CodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { createHarness } from "../support/harness.ts";

describe("Feishu session continuation", () => {
  test("同一 chat 会续用同一个 Codex session，且共享 workspace 的不同 chat 不会串线", async () => {
    const transport: CodexTransport = {
      async *run(request) {
        if (request.triggerMessageId === "msg-001") {
          yield {
            type: "result",
            resultSummary: "已建立 chat-001 上下文",
            bridgeSessionId: "thread-chat-001",
            sessionOutcome: "created",
          };
          return;
        }

        if (request.triggerMessageId === "msg-002") {
          yield {
            type: "result",
            resultSummary: `续聊命中 ${request.bridgeSessionId ?? "none"}`,
            bridgeSessionId: request.bridgeSessionId ?? "thread-chat-001",
            sessionOutcome: "continued",
          };
          return;
        }

        yield {
          type: "result",
          resultSummary: "已建立 chat-002 上下文",
          bridgeSessionId: "thread-chat-002",
          sessionOutcome: "created",
        };
      },
    };
    const harness = createHarness({ transport });

    await harness.postFeishuText("请记住我正在做 004", {
      chat_id: "chat-001",
      message_id: "msg-001",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    const firstBinding = await harness.repositories.conversationSessionBindings.getBindingBySessionId(
      (await harness.repositories.sessions.getSessionByChat("feishu", "chat-001"))!.id,
    );
    expect(firstBinding?.bridgeSessionId).toBe("thread-chat-001");

    await harness.postFeishuText("我上一条在做什么？", {
      chat_id: "chat-001",
      message_id: "msg-002",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    await harness.postFeishuText("这是另一个 chat 的新问题", {
      chat_id: "chat-002",
      message_id: "msg-003",
      user_id: "user-002",
    });
    await harness.executor.processNext();

    expect(harness.bridgeRequests.map((request) => ({
      messageId: request.triggerMessageId,
      sessionMode: request.sessionMode ?? "fresh",
      bridgeSessionId: request.bridgeSessionId ?? null,
    }))).toEqual([
      {
        messageId: "msg-001",
        sessionMode: "fresh",
        bridgeSessionId: null,
      },
      {
        messageId: "msg-002",
        sessionMode: "continuation",
        bridgeSessionId: "thread-chat-001",
      },
      {
        messageId: "msg-003",
        sessionMode: "fresh",
        bridgeSessionId: null,
      },
    ]);

    const secondBinding = await harness.repositories.conversationSessionBindings.getBindingBySessionId(
      (await harness.repositories.sessions.getSessionByChat("feishu", "chat-002"))!.id,
    );
    expect(secondBinding?.bridgeSessionId).toBe("thread-chat-002");
  });
});
