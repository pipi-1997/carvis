import { describe, expect, test } from "bun:test";

import type { CodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { createHarness } from "../support/harness.ts";

describe("feishu session workspace status", () => {
  test("/status 会展示当前 workspace key、来源和 continuation 状态", async () => {
    const transport: CodexTransport = {
      async *run() {
        yield {
          type: "result",
          resultSummary: "已记录上下文",
          bridgeSessionId: "thread-ops-001",
          sessionOutcome: "created",
        };
      },
    };
    const harness = createHarness({
      transport,
      workspaceResolver: {
        registry: {
          main: "/tmp/carvis-workspace",
          ops: "/tmp/carvis-ops-workspace",
        },
      },
    });

    await harness.postFeishuText("/bind ops", {
      chat_id: "chat-ops",
      chat_type: "group",
      message_id: "msg-bind",
      user_id: "user-001",
    });

    await harness.postFeishuText("继续这个 workspace", {
      chat_id: "chat-ops",
      chat_type: "group",
      message_id: "msg-001",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    const response = await harness.postFeishuText("/status", {
      chat_id: "chat-ops",
      chat_type: "group",
      message_id: "msg-status",
      user_id: "user-001",
    });

    expect(response.status).toBe(200);
    expect(harness.sentMessages.at(-1)?.content).toContain("workspace key: ops");
    expect(harness.sentMessages.at(-1)?.content).toContain("workspace 来源: manual");
    expect(harness.sentMessages.at(-1)?.content).toContain("当前会话续聊: continued");
  });

  test("/new 只重置 continuation，不改变当前 workspace binding", async () => {
    const harness = createHarness();

    await harness.postFeishuText("/bind feature-a", {
      chat_id: "chat-feature",
      chat_type: "group",
      message_id: "msg-bind",
      user_id: "user-001",
    });

    await harness.postFeishuText("在这个 workspace 里建立上下文", {
      chat_id: "chat-feature",
      chat_type: "group",
      message_id: "msg-001",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    const resetResponse = await harness.postFeishuText("/new", {
      chat_id: "chat-feature",
      chat_type: "group",
      message_id: "msg-new",
      user_id: "user-001",
    });
    expect(resetResponse.status).toBe(200);

    const session = await harness.repositories.sessions.getSessionByChat("feishu", "chat-feature");
    const workspaceBinding = await harness.repositories.sessionWorkspaceBindings.getBindingBySessionId(session!.id);
    expect(workspaceBinding).toMatchObject({
      workspaceKey: "feature-a",
      bindingSource: "created",
    });

    const statusResponse = await harness.postFeishuText("/status", {
      chat_id: "chat-feature",
      chat_type: "group",
      message_id: "msg-status",
      user_id: "user-001",
    });

    expect(statusResponse.status).toBe(200);
    expect(harness.sentMessages.at(-1)?.content).toContain("workspace key: feature-a");
    expect(harness.sentMessages.at(-1)?.content).toContain("workspace 来源: created");
    expect(harness.sentMessages.at(-1)?.content).toContain("当前会话续聊: recent_reset");
  });

  test("unbound group chat 的 /status 会返回下一步绑定提示", async () => {
    const harness = createHarness();

    const response = await harness.postFeishuText("/status", {
      chat_id: "chat-unbound",
      chat_type: "group",
      message_id: "msg-status",
      user_id: "user-001",
    });

    expect(response.status).toBe(200);
    expect(harness.sentMessages.at(-1)?.content).toContain("workspace 来源: unbound");
    expect(harness.sentMessages.at(-1)?.content).toContain("/bind <workspace-key>");
  });

  test("heartbeat 失效后 /status 仍显示当前 workspace binding", async () => {
    const harness = createHarness({
      transportScript: [{ type: "wait-for-cancel" }],
      heartbeatTtlMs: 10,
    });

    await harness.postFeishuText("/bind feature-status", {
      chat_id: "chat-status-heartbeat",
      chat_type: "group",
      message_id: "msg-bind",
      user_id: "user-001",
    });
    await harness.postFeishuText("开始长时间任务", {
      chat_id: "chat-status-heartbeat",
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

    const response = await harness.postFeishuText("/status", {
      chat_id: "chat-status-heartbeat",
      chat_type: "group",
      message_id: "msg-status",
      user_id: "user-001",
    });

    expect(response.status).toBe(200);
    expect(harness.sentMessages.at(-1)?.content).toContain("workspace key: feature-status");
    expect(harness.sentMessages.at(-1)?.content).toContain("workspace 来源: created");
    expect(harness.sentMessages.at(-1)?.content).toContain("最近运行状态: failed");
  });
});
