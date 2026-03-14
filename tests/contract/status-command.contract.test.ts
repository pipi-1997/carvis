import { describe, expect, test } from "bun:test";

import { handleStatusCommand } from "../../apps/gateway/src/commands/status.ts";
import { TEST_AGENT_CONFIG, createHarness } from "../support/harness.ts";

describe("/status contract", () => {
  test("private chat 没有 active run 时返回 default workspace 绑定和空闲状态", async () => {
    const harness = createHarness();
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "p2p-001",
      agentConfig: TEST_AGENT_CONFIG,
    });

    const result = await handleStatusCommand({
      session,
      chatType: "private",
      agentConfig: TEST_AGENT_CONFIG,
      repositories: harness.repositories,
      queue: harness.queue,
      workspaceResolverConfig: harness.workspaceResolverConfig,
    });

    expect(result.kind).toBe("status");
    expect(result.content).toContain("当前无活动运行");
    expect(result.content).toContain("workspace key: main");
    expect(result.content).toContain("workspace 来源: default");
    expect(result.content).toContain("当前会话续聊: fresh");
    expect(result.content).toContain("sandbox mode: workspace-write");
    expect(result.content).toContain("sandbox 来源: workspace_default");
  });

  test("存在手动 workspace 绑定和续聊绑定时同时返回 manual 与 continued", async () => {
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: "/tmp/carvis-status-main-workspace",
          ops: "/tmp/carvis-ops-workspace",
        },
        sandboxModes: {
          main: "workspace-write",
          ops: "workspace-write",
        },
      },
    });
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: TEST_AGENT_CONFIG,
    });
    await harness.repositories.sessionWorkspaceBindings.saveBinding({
      session,
      workspaceKey: "ops",
      bindingSource: "manual",
      now: new Date("2026-03-09T00:00:00.000Z"),
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
      chatType: "group",
      agentConfig: TEST_AGENT_CONFIG,
      repositories: harness.repositories,
      queue: harness.queue,
      workspaceResolverConfig: harness.workspaceResolverConfig,
    });

    expect(result.content).toContain("workspace key: ops");
    expect(result.content).toContain("workspace 来源: manual");
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
      chatType: "group",
      agentConfig: TEST_AGENT_CONFIG,
      repositories: harness.repositories,
      queue: harness.queue,
      workspaceResolverConfig: harness.workspaceResolverConfig,
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
      chatType: "group",
      agentConfig: TEST_AGENT_CONFIG,
      repositories: harness.repositories,
      queue: harness.queue,
      workspaceResolverConfig: harness.workspaceResolverConfig,
    });

    expect(result.content).toContain("当前会话续聊: recent_recovery_failed");
  });

  test("unbound group chat 会返回 unbound 状态和 bind 引导", async () => {
    const harness = createHarness();
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-unbound",
      agentConfig: TEST_AGENT_CONFIG,
    });

    const result = await handleStatusCommand({
      session,
      chatType: "group",
      agentConfig: TEST_AGENT_CONFIG,
      repositories: harness.repositories,
      queue: harness.queue,
      workspaceResolverConfig: harness.workspaceResolverConfig,
    });

    expect(result.content).toContain("workspace key: (unbound)");
    expect(result.content).toContain("workspace 来源: unbound");
    expect(result.content).toContain("/bind <workspace-key>");
  });

  test("存在 chat sandbox override 时返回当前 mode、来源和有效期", async () => {
    const harness = createHarness();
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-override",
      agentConfig: TEST_AGENT_CONFIG,
    });
    await harness.repositories.chatSandboxOverrides.upsertOverride({
      sessionId: session.id,
      chatId: session.chatId,
      agentId: session.agentId,
      workspace: harness.agentConfig.workspace,
      sandboxMode: "danger-full-access",
      expiresAt: "2026-03-20T00:30:00.000Z",
      setByUserId: "user-001",
      now: new Date("2026-03-08T00:00:00.000Z"),
    });

    const result = await handleStatusCommand({
      session,
      chatType: "private",
      agentConfig: harness.agentConfig,
      repositories: harness.repositories,
      queue: harness.queue,
      workspaceResolverConfig: harness.workspaceResolverConfig,
    });

    expect(result.content).toContain("sandbox mode: danger-full-access");
    expect(result.content).toContain("sandbox 来源: chat_override");
    expect(result.content).toContain("sandbox override 到期: 2026-03-20T00:30:00.000Z");
  });
});
