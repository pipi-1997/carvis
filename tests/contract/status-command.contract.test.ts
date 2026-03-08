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
  });
});
