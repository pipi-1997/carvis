import { afterEach, describe, expect, mock, test } from "bun:test";

import { GatewayToolClientError, createGatewayToolClient } from "../../apps/executor/src/gateway-tool-client.ts";
import type { Run } from "../../packages/core/src/domain/models.ts";

const baseRun: Run = {
  id: "run-001",
  sessionId: "session-001",
  agentId: "codex-main",
  workspace: "/tmp/workspaces/main",
  status: "running",
  prompt: "帮我管理一下定时任务",
  managementMode: "schedule",
  triggerSource: "chat_message",
  triggerExecutionId: null,
  triggerMessageId: "msg-001",
  triggerUserId: "user-001",
  timeoutSeconds: 60,
  requestedSandboxMode: "workspace-write",
  resolvedSandboxMode: "workspace-write",
  sandboxModeSource: "workspace_default",
  requestedSessionMode: "fresh",
  requestedBridgeSessionId: null,
  resolvedBridgeSessionId: null,
  sessionRecoveryAttempted: false,
  sessionRecoveryResult: null,
  deliveryTarget: null,
  queuePosition: 0,
  startedAt: "2026-03-10T00:00:00.000Z",
  finishedAt: null,
  failureCode: null,
  failureMessage: null,
  cancelRequestedAt: null,
  createdAt: "2026-03-10T00:00:00.000Z",
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("gateway tool client", () => {
  test("fetch 自身失败时也归类为 mcp_tool_call_failed", async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;

    const client = createGatewayToolClient({
      baseUrl: "http://localhost",
    });

    await expect(client.execute({
      run: baseRun,
      session: { id: "session-001", chatId: "chat-001" },
      toolName: "schedule.list",
      arguments: {
        actionType: "list",
      },
    })).rejects.toBeInstanceOf(GatewayToolClientError);

    await expect(client.execute({
      run: baseRun,
      session: { id: "session-001", chatId: "chat-001" },
      toolName: "schedule.list",
      arguments: {
        actionType: "list",
      },
    })).rejects.toThrow("network down");
  });

  test("gateway 返回非法 JSON 时也归类为 mcp_tool_call_failed", async () => {
    globalThis.fetch = mock(async () => {
      return new Response("not-json", {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as unknown as typeof fetch;

    const client = createGatewayToolClient({
      baseUrl: "http://localhost",
    });

    await expect(client.execute({
      run: baseRun,
      session: { id: "session-001", chatId: "chat-001" },
      toolName: "schedule.list",
      arguments: {
        actionType: "list",
      },
    })).rejects.toBeInstanceOf(GatewayToolClientError);
  });
});
