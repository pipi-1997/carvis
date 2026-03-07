import { describe, expect, test } from "bun:test";

import { handleAbortCommand } from "../../apps/gateway/src/commands/abort.ts";
import { TEST_AGENT_CONFIG, createHarness } from "../support/harness.ts";

describe("/abort contract", () => {
  test("存在 active run 时发出取消信号", async () => {
    const harness = createHarness();
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: TEST_AGENT_CONFIG,
    });
    const run = await harness.repositories.runs.createQueuedRun({
      sessionId: session.id,
      agentId: TEST_AGENT_CONFIG.id,
      workspace: TEST_AGENT_CONFIG.workspace,
      prompt: "请停止",
      triggerMessageId: "msg-001",
      triggerUserId: "user-001",
      timeoutSeconds: 60,
    });
    await harness.repositories.runs.markRunStarted(run.id, "2026-03-08T00:00:00.000Z");

    const result = await handleAbortCommand({
      session,
      agentConfig: TEST_AGENT_CONFIG,
      repositories: harness.repositories,
      cancelSignals: harness.cancelSignals,
      now: () => new Date("2026-03-08T00:00:01.000Z"),
    });

    expect(result.kind).toBe("status");
    expect(result.content).toContain("已发出取消请求");
    expect(await harness.cancelSignals.isCancellationRequested(run.id)).toBeTrue();
  });
});
