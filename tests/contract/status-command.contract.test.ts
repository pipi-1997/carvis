import { describe, expect, test } from "bun:test";

import { handleStatusCommand } from "../../apps/gateway/src/commands/status.ts";
import { TEST_AGENT_CONFIG, createHarness } from "../support/harness.ts";

describe("/status contract", () => {
  test("没有 active run 时返回绑定信息和空闲状态", async () => {
    const harness = createHarness();
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: TEST_AGENT_CONFIG,
    });

    const result = await handleStatusCommand({
      session,
      agentConfig: TEST_AGENT_CONFIG,
      repositories: harness.repositories,
      queue: harness.queue,
    });

    expect(result.kind).toBe("status");
    expect(result.content).toContain("当前无活动运行");
    expect(result.content).toContain(TEST_AGENT_CONFIG.workspace);
    expect(result.content).toContain("当前会话续聊: fresh");
  });

  test("存在续聊绑定时返回 continued 状态", async () => {
    const harness = createHarness();
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: TEST_AGENT_CONFIG,
    });
    await harness.repositories.conversationSessionBindings.saveBindingContinuation({
      session,
      bridge: "codex",
      bridgeSessionId: "thread-001",
      status: "bound",
      now: new Date("2026-03-09T00:00:00.000Z"),
    });

    const result = await handleStatusCommand({
      session,
      agentConfig: TEST_AGENT_CONFIG,
      repositories: harness.repositories,
      queue: harness.queue,
    });

    expect(result.content).toContain("当前会话续聊: continued");
  });

  test("最近一次自动恢复成功时返回 recent_recovered 状态", async () => {
    const harness = createHarness();
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: TEST_AGENT_CONFIG,
    });
    await harness.repositories.conversationSessionBindings.saveBindingContinuation({
      session,
      bridge: "codex",
      bridgeSessionId: "thread-recovered",
      status: "recovered",
      recoveryResult: "recovered",
      now: new Date("2026-03-09T00:00:00.000Z"),
    });

    const result = await handleStatusCommand({
      session,
      agentConfig: TEST_AGENT_CONFIG,
      repositories: harness.repositories,
      queue: harness.queue,
    });

    expect(result.content).toContain("当前会话续聊: recent_recovered");
  });

  test("最近一次自动恢复失败时返回 recent_recovery_failed 状态", async () => {
    const harness = createHarness();
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: TEST_AGENT_CONFIG,
    });
    await harness.repositories.conversationSessionBindings.markBindingInvalidated({
      session,
      reason: "session not found",
      recoveryResult: "failed",
      now: new Date("2026-03-09T00:00:00.000Z"),
    });

    const result = await handleStatusCommand({
      session,
      agentConfig: TEST_AGENT_CONFIG,
      repositories: harness.repositories,
      queue: harness.queue,
    });

    expect(result.content).toContain("当前会话续聊: recent_recovery_failed");
  });
});
