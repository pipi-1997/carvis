import { describe, expect, test } from "bun:test";

import type { CodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { createHarness } from "../support/harness.ts";

describe("Feishu session memory commands", () => {
  test("/new 会重置当前 chat 的续聊绑定，且不会打断活动运行", async () => {
    const transport: CodexTransport = {
      async *run(request, { signal }) {
        if (request.triggerMessageId === "msg-001") {
          yield {
            type: "result",
            resultSummary: "已建立初始上下文",
            bridgeSessionId: "thread-001",
            sessionOutcome: "created",
          };
          return;
        }

        if (request.triggerMessageId === "msg-002") {
          await new Promise<void>((resolve) => {
            signal.addEventListener("abort", () => resolve(), { once: true });
          });
          yield {
            type: "cancelled",
            reason: "cancel requested",
          };
          return;
        }

        yield {
          type: "result",
          resultSummary: "重置后重新开始",
          bridgeSessionId: "thread-002",
          sessionOutcome: "created",
        };
      },
    };
    const harness = createHarness({ transport });

    await harness.postFeishuText("记住这是旧上下文", {
      chat_id: "chat-001",
      message_id: "msg-001",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    await harness.postFeishuText("继续旧上下文里的任务", {
      chat_id: "chat-001",
      message_id: "msg-002",
      user_id: "user-001",
    });
    const activeRun = harness.executor.processNext();

    const resetResponse = await harness.postFeishuText("/new", {
      chat_id: "chat-001",
      message_id: "msg-003",
      user_id: "user-001",
    });
    expect(resetResponse.status).toBe(200);

    const session = await harness.repositories.sessions.getSessionByChat("feishu", "chat-001");
    const bindingAfterReset = await harness.repositories.conversationSessionBindings.getBindingBySessionId(session!.id);
    expect(bindingAfterReset?.status).toBe("reset");

    const running = await harness.repositories.runs.getLatestRunByChat("feishu", "chat-001");
    expect(running?.status).toBe("running");
    expect(running?.cancelRequestedAt).toBeNull();

    await harness.postFeishuText("/status", {
      chat_id: "chat-001",
      message_id: "msg-003-status",
      user_id: "user-001",
    });

    await harness.postFeishuText("现在开始一个新话题", {
      chat_id: "chat-001",
      message_id: "msg-004",
      user_id: "user-001",
    });

    await harness.cancelSignals.requestCancellation(running!.id);
    await activeRun;
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
        bridgeSessionId: "thread-001",
      },
      {
        messageId: "msg-004",
        sessionMode: "fresh",
        bridgeSessionId: null,
      },
    ]);

    expect(harness.sentMessages.at(-1)?.content).toContain("当前会话续聊: recent_reset");
  });

  test("/new 之后旧 run 完成也不能恢复旧续聊绑定", async () => {
    let resolveSecondRun: (() => void) | undefined;
    const secondRunDone = new Promise<void>((resolve) => {
      resolveSecondRun = resolve;
    });
    const transport: CodexTransport = {
      async *run(request) {
        if (request.triggerMessageId === "msg-001") {
          yield {
            type: "result",
            resultSummary: "已建立初始上下文",
            bridgeSessionId: "thread-001",
            sessionOutcome: "created",
          };
          return;
        }

        if (request.triggerMessageId === "msg-002") {
          await secondRunDone;
          yield {
            type: "result",
            resultSummary: "旧 run 完成",
            bridgeSessionId: "thread-001",
            sessionOutcome: "continued",
          };
          return;
        }

        yield {
          type: "result",
          resultSummary: "重置后继续",
          bridgeSessionId: "thread-002",
          sessionOutcome: "created",
        };
      },
    };
    const harness = createHarness({ transport });

    await harness.postFeishuText("先建立上下文", {
      chat_id: "chat-001",
      message_id: "msg-001",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    await harness.postFeishuText("继续旧上下文", {
      chat_id: "chat-001",
      message_id: "msg-002",
      user_id: "user-001",
    });
    const activeRun = harness.executor.processNext();

    harness.advanceTime(1);
    const resetResponse = await harness.postFeishuText("/new", {
      chat_id: "chat-001",
      message_id: "msg-reset",
      user_id: "user-001",
    });
    expect(resetResponse.status).toBe(200);

    resolveSecondRun?.();
    await activeRun;

    harness.advanceTime(1);
    await harness.postFeishuText("重置后下一条消息", {
      chat_id: "chat-001",
      message_id: "msg-003",
      user_id: "user-001",
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
        bridgeSessionId: "thread-001",
      },
      {
        messageId: "msg-003",
        sessionMode: "fresh",
        bridgeSessionId: null,
      },
    ]);
  });
});
