import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

async function executeTool(
  harness: ReturnType<typeof createHarness>,
  payload: Record<string, unknown>,
) {
  const response = await harness.gateway.request("http://localhost/internal/run-tools/execute", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return {
    response,
    body: await response.json() as { ok: boolean; result: Record<string, unknown> },
  };
}

async function createActiveRun(harness: ReturnType<typeof createHarness>) {
  const session = await harness.repositories.sessions.getOrCreateSession({
    channel: "feishu",
    chatId: "chat-001",
    agentConfig: harness.agentConfig,
  });
  const queuedRun = await harness.repositories.runs.createQueuedRun({
    sessionId: session.id,
    agentId: harness.agentConfig.id,
    workspace: harness.agentConfig.workspace,
    prompt: "把图片直接发给我",
    triggerMessageId: "msg-001",
    triggerUserId: "user-001",
    timeoutSeconds: harness.agentConfig.timeoutSeconds,
  });
  const run = await harness.repositories.runs.markRunStarted(queuedRun.id, new Date().toISOString());

  return { run, session };
}

describe("media delivery tools contract", () => {
  test("media.send 在缺少 session 上下文时必须返回 invalid_context", async () => {
    const harness = createHarness();

    const { response, body } = await executeTool(harness, {
      toolName: "media.send",
      invocation: {
        actionType: "send",
        sourceType: "local_path",
        path: "/tmp/output.png",
      },
      workspace: harness.agentConfig.workspace,
      sessionId: "",
      chatId: "",
      userId: "user-001",
      requestedText: "把图片直接发给我",
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      result: {
        status: "rejected",
        reason: "invalid_context",
        mediaDeliveryId: null,
        targetRef: null,
        summary: "当前没有可用的会话上下文，不能发送资源。",
      },
    });
  });

  test("media.send 伪造 chatId 时必须拒绝跨 session 投递", async () => {
    const harness = createHarness();
    const { run, session } = await createActiveRun(harness);

    const { response, body } = await executeTool(harness, {
      runId: run.id,
      toolName: "media.send",
      invocation: {
        actionType: "send",
        sourceType: "local_path",
        path: "/tmp/output.png",
      },
      workspace: harness.agentConfig.workspace,
      sessionId: session.id,
      chatId: "chat-forged",
      userId: "user-001",
      requestedText: "把图片直接发给我",
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      result: {
        status: "rejected",
        reason: "invalid_context",
        mediaDeliveryId: null,
        targetRef: null,
        summary: "当前没有可用的会话上下文，不能发送资源。",
      },
    });
    expect(await harness.repositories.runMediaDeliveries.listMediaDeliveries()).toEqual([]);
  });

  test("media.send 对已结束 run 必须拒绝继续投递", async () => {
    const harness = createHarness();
    const { run, session } = await createActiveRun(harness);
    await harness.repositories.runs.markRunCompleted(run.id, new Date().toISOString(), "done");

    const { response, body } = await executeTool(harness, {
      runId: run.id,
      toolName: "media.send",
      invocation: {
        actionType: "send",
        sourceType: "local_path",
        path: "/tmp/output.png",
      },
      workspace: harness.agentConfig.workspace,
      sessionId: session.id,
      chatId: session.chatId,
      userId: "user-001",
      requestedText: "把图片直接发给我",
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      result: {
        status: "rejected",
        reason: "invalid_context",
        mediaDeliveryId: null,
        targetRef: null,
        summary: "当前没有可用的会话上下文，不能发送资源。",
      },
    });
    expect(await harness.repositories.runMediaDeliveries.listMediaDeliveries()).toEqual([]);
  });
});
