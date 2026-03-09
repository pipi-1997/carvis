import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("heartbeat expiry", () => {
  test("执行器心跳过期后 active run 被标记失败", async () => {
    const harness = createHarness({
      transportScript: [{ type: "wait-for-cancel" }],
      heartbeatTtlMs: 10,
    });

    await harness.postFeishuText("需要长时间运行的任务", {
      chat_id: "p2p-heartbeat",
      chat_type: "p2p",
      message_id: "msg-001",
      user_id: "user-001",
    });
    const running = harness.executor.processNext();

    await harness.waitForRunStatus("running");
    const runId = (await harness.repositories.runs.listRuns()).at(-1)?.id;
    if (!runId) {
      throw new Error("expected active run");
    }
    await harness.waitForHeartbeat(runId);
    harness.advanceTime(20);
    await harness.reaper.reapExpiredRuns();
    await running;

    const latestRun = (await harness.repositories.runs.listRuns()).at(-1);
    expect(latestRun?.status).toBe("failed");
    expect(latestRun?.failureCode).toBe("heartbeat_expired");
  });

  test("heartbeat 过期后 session 的 workspace binding 仍然可见", async () => {
    const harness = createHarness({
      transportScript: [{ type: "wait-for-cancel" }],
      heartbeatTtlMs: 10,
    });

    await harness.postFeishuText("/bind feature-heartbeat", {
      chat_id: "chat-heartbeat",
      chat_type: "group",
      message_id: "msg-bind",
      user_id: "user-001",
    });
    await harness.postFeishuText("开始长时间任务", {
      chat_id: "chat-heartbeat",
      chat_type: "group",
      message_id: "msg-001",
      user_id: "user-001",
    });

    const running = harness.executor.processNext();
    await harness.waitForRunStatus("running");

    const runId = (await harness.repositories.runs.listRuns()).at(-1)?.id;
    if (!runId) {
      throw new Error("expected active run");
    }

    await harness.waitForHeartbeat(runId);
    harness.advanceTime(20);
    await harness.reaper.reapExpiredRuns();
    await running;

    const session = await harness.repositories.sessions.getSessionByChat("feishu", "chat-heartbeat");
    const binding = await harness.repositories.sessionWorkspaceBindings.getBindingBySessionId(session!.id);
    expect(binding).toMatchObject({
      workspaceKey: "feature-heartbeat",
      bindingSource: "created",
    });
  });
});
