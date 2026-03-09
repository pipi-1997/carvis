import { describe, expect, test } from "bun:test";

import type { CodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { TEST_AGENT_CONFIG, createHarness } from "../support/harness.ts";

describe("Feishu session recovery", () => {
  test("续聊 session 失效后只自动恢复一次，并回写新绑定", async () => {
    const transport: CodexTransport = {
      async *run(request) {
        if (request.sessionMode === "continuation") {
          yield {
            type: "error",
            failureCode: "codex_exec_failed",
            failureMessage: "session not found",
            sessionInvalid: true,
          };
          return;
        }

        yield {
          type: "result",
          resultSummary: "已自动恢复为新会话",
          bridgeSessionId: "thread-recovered",
          sessionOutcome: "created",
        };
      },
    };
    const harness = createHarness({ transport });
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: TEST_AGENT_CONFIG,
      now: new Date("2026-03-09T00:00:00.000Z"),
    });
    await harness.repositories.conversationSessionBindings.saveBindingContinuation({
      session,
      bridge: "codex",
      bridgeSessionId: "thread-invalid",
      status: "bound",
      now: new Date("2026-03-09T00:00:00.000Z"),
    });

    await harness.postFeishuText("继续之前的话题", {
      chat_id: "chat-001",
      message_id: "msg-001",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    const run = await harness.repositories.runs.getLatestRunBySession(session.id);
    expect(run?.status).toBe("completed");
    expect(run?.sessionRecoveryAttempted).toBeTrue();
    expect(run?.sessionRecoveryResult).toBe("recovered");
    expect(run?.resolvedBridgeSessionId).toBe("thread-recovered");

    const recoveredBinding = await harness.repositories.conversationSessionBindings.getBindingBySessionId(session.id);
    expect(recoveredBinding?.status).toBe("recovered");
    expect(recoveredBinding?.bridgeSessionId).toBe("thread-recovered");

    expect(harness.bridgeRequests.map((request) => ({
      sessionMode: request.sessionMode ?? "fresh",
      bridgeSessionId: request.bridgeSessionId ?? null,
    }))).toEqual([
      {
        sessionMode: "continuation",
        bridgeSessionId: "thread-invalid",
      },
      {
        sessionMode: "fresh",
        bridgeSessionId: null,
      },
    ]);
  });

  test("自动恢复后的卡片投递失败不会把成功运行误记为 failed", async () => {
    const transport: CodexTransport = {
      async *run(request) {
        if (request.sessionMode === "continuation") {
          yield {
            type: "error",
            failureCode: "codex_exec_failed",
            failureMessage: "session not found",
            sessionInvalid: true,
          };
          return;
        }

        yield {
          type: "delta",
          deltaText: "恢复后继续输出",
          sequence: 1,
          source: "assistant",
        };
        yield {
          type: "result",
          resultSummary: "恢复成功",
          bridgeSessionId: "thread-recovered",
          sessionOutcome: "created",
        };
      },
    };
    const harness = createHarness({
      transport,
      presentation: {
        failCardUpdate: true,
      },
    });
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: TEST_AGENT_CONFIG,
      now: new Date("2026-03-09T00:00:00.000Z"),
    });
    await harness.repositories.conversationSessionBindings.saveBindingContinuation({
      session,
      bridge: "codex",
      bridgeSessionId: "thread-invalid",
      status: "bound",
      now: new Date("2026-03-09T00:00:00.000Z"),
    });

    await harness.postFeishuText("继续之前的话题", {
      chat_id: "chat-001",
      message_id: "msg-001",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    const run = await harness.repositories.runs.getLatestRunBySession(session.id);
    expect(run?.status).toBe("completed");
    expect(run?.sessionRecoveryResult).toBe("recovered");

    const deliveries = await harness.repositories.deliveries.listDeliveries();
    expect(deliveries.some((delivery) => delivery.status === "failed")).toBeTrue();
  });

  test("自动恢复失败后保留 recent_recovery_failed 状态", async () => {
    const transport: CodexTransport = {
      async *run(request) {
        if (request.sessionMode === "continuation") {
          yield {
            type: "error",
            failureCode: "codex_exec_failed",
            failureMessage: "session not found",
            sessionInvalid: true,
          };
          return;
        }

        yield {
          type: "error",
          failureCode: "codex_exec_failed",
          failureMessage: "fresh session boot failed",
        };
      },
    };
    const harness = createHarness({ transport });
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: TEST_AGENT_CONFIG,
      now: new Date("2026-03-09T00:00:00.000Z"),
    });
    await harness.repositories.conversationSessionBindings.saveBindingContinuation({
      session,
      bridge: "codex",
      bridgeSessionId: "thread-invalid",
      status: "bound",
      now: new Date("2026-03-09T00:00:00.000Z"),
    });

    await harness.postFeishuText("继续之前的话题", {
      chat_id: "chat-001",
      message_id: "msg-001",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    const run = await harness.repositories.runs.getLatestRunBySession(session.id);
    expect(run?.status).toBe("failed");
    expect(run?.sessionRecoveryAttempted).toBeTrue();
    expect(run?.sessionRecoveryResult).toBe("failed");

    const statusResponse = await harness.postFeishuText("/status", {
      chat_id: "chat-001",
      message_id: "msg-002",
      user_id: "user-001",
    });
    expect(statusResponse.status).toBe(200);
    expect(harness.sentMessages.at(-1)?.content).toContain("当前会话续聊: recent_recovery_failed");
  });

  test("fresh retry 直接抛错时也保留 recent_recovery_failed 状态", async () => {
    const transport: CodexTransport = {
      async *run(request) {
        if (request.sessionMode === "continuation") {
          yield {
            type: "error",
            failureCode: "codex_exec_failed",
            failureMessage: "session not found",
            sessionInvalid: true,
          };
          return;
        }

        throw new Error("fresh retry crashed before streaming");
      },
    };
    const harness = createHarness({ transport });
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: TEST_AGENT_CONFIG,
      now: new Date("2026-03-09T00:00:00.000Z"),
    });
    await harness.repositories.conversationSessionBindings.saveBindingContinuation({
      session,
      bridge: "codex",
      bridgeSessionId: "thread-invalid",
      status: "bound",
      now: new Date("2026-03-09T00:00:00.000Z"),
    });

    await harness.postFeishuText("继续之前的话题", {
      chat_id: "chat-001",
      message_id: "msg-throw",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    const run = await harness.repositories.runs.getLatestRunBySession(session.id);
    expect(run?.status).toBe("failed");
    expect(run?.sessionRecoveryAttempted).toBeTrue();
    expect(run?.sessionRecoveryResult).toBe("failed");

    const binding = await harness.repositories.conversationSessionBindings.getBindingBySessionId(session.id);
    expect(binding?.status).toBe("invalidated");
    expect(binding?.lastRecoveryResult).toBe("failed");

    const statusResponse = await harness.postFeishuText("/status", {
      chat_id: "chat-001",
      message_id: "msg-throw-status",
      user_id: "user-001",
    });
    expect(statusResponse.status).toBe(200);
    expect(harness.sentMessages.at(-1)?.content).toContain("当前会话续聊: recent_recovery_failed");
  });

  test("续聊请求静默落到新 thread 时也会回写 recovered 状态", async () => {
    const transport: CodexTransport = {
      async *run(request) {
        if (request.sessionMode === "continuation") {
          yield {
            type: "result",
            resultSummary: "已切到新 thread",
            bridgeSessionId: "thread-recovered-silent",
            sessionOutcome: "created",
          };
          return;
        }

        throw new Error("fresh retry should not run for silent recovery");
      },
    };
    const harness = createHarness({ transport });
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: TEST_AGENT_CONFIG,
      now: new Date("2026-03-09T00:00:00.000Z"),
    });
    await harness.repositories.conversationSessionBindings.saveBindingContinuation({
      session,
      bridge: "codex",
      bridgeSessionId: "thread-stale",
      status: "bound",
      now: new Date("2026-03-09T00:00:00.000Z"),
    });

    await harness.postFeishuText("继续之前的话题", {
      chat_id: "chat-001",
      message_id: "msg-silent-recovery",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    const run = await harness.repositories.runs.getLatestRunBySession(session.id);
    expect(run?.status).toBe("completed");
    expect(run?.sessionRecoveryAttempted).toBeTrue();
    expect(run?.sessionRecoveryResult).toBe("recovered");
    expect(run?.resolvedBridgeSessionId).toBe("thread-recovered-silent");

    const recoveredBinding = await harness.repositories.conversationSessionBindings.getBindingBySessionId(session.id);
    expect(recoveredBinding?.status).toBe("recovered");
    expect(recoveredBinding?.bridgeSessionId).toBe("thread-recovered-silent");
  });
});
