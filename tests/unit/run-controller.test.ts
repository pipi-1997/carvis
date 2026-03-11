import { describe, expect, test } from "bun:test";

import { createRunController } from "../../apps/executor/src/run-controller.ts";
import { GatewayToolClientError } from "../../apps/executor/src/gateway-tool-client.ts";
import { CodexBridge, createScriptedCodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { CancelSignalStore } from "../../packages/core/src/runtime/cancel-signal.ts";
import { HeartbeatMonitor } from "../../packages/core/src/runtime/heartbeat.ts";
import { createInMemoryRepositories } from "../../packages/core/src/storage/repositories.ts";

describe("run controller", () => {
  test("gateway tool relay 失败时会标记为 mcp_tool_call_failed，而不是 bridge_error", async () => {
    const repositories = createInMemoryRepositories();
    const session = await repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: {
        id: "codex-main",
        bridge: "codex",
        defaultWorkspace: "main",
        workspace: "/tmp/workspaces/main",
        timeoutSeconds: 60,
        maxConcurrent: 1,
      },
      now: new Date("2026-03-10T00:00:00.000Z"),
    });
    const run = await repositories.runs.createQueuedRun({
      sessionId: session.id,
      agentId: "codex-main",
      workspace: "/tmp/workspaces/main",
      prompt: "管理一下定时任务",
      managementMode: "schedule",
      triggerMessageId: "msg-001",
      triggerUserId: "user-001",
      timeoutSeconds: 60,
      now: new Date("2026-03-10T00:00:00.000Z"),
    });
    await repositories.runs.markRunStarted(run.id, "2026-03-10T00:00:01.000Z");

    const bridge = new CodexBridge({
      transport: createScriptedCodexTransport([
        {
          type: "tool_call",
          toolName: "schedule.list",
          arguments: {
            actionType: "list",
            workspace: "/tmp/workspaces/main",
          },
        },
      ]),
      now: () => new Date("2026-03-10T00:00:02.000Z"),
    });

    const controller = createRunController({
      agentConfig: {
        id: "codex-main",
        bridge: "codex",
        defaultWorkspace: "main",
        workspace: "/tmp/workspaces/main",
        timeoutSeconds: 60,
        maxConcurrent: 1,
      },
      repositories,
      cancelSignals: new CancelSignalStore(),
      heartbeats: new HeartbeatMonitor({ ttlMs: 1_000 }),
      bridge,
      toolInvoker: {
        async execute() {
          throw new GatewayToolClientError(503);
        },
      },
      notifier: {
        async notifyRunEvent() {
          return;
        },
      },
      now: () => new Date("2026-03-10T00:00:02.000Z"),
    });

    await controller.execute({
      ...(await repositories.runs.getRunById(run.id))!,
    });

    const failed = await repositories.runs.getRunById(run.id);
    expect(failed?.status).toBe("failed");
    expect(failed?.failureCode).toBe("mcp_tool_call_failed");
    expect(failed?.failureMessage).toContain("gateway tool call failed: 503");
  });

  test("transport 已处理的 MCP tool_call 不会再被 executor relay 第二次", async () => {
    const repositories = createInMemoryRepositories();
    const session = await repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: {
        id: "codex-main",
        bridge: "codex",
        defaultWorkspace: "main",
        workspace: "/tmp/workspaces/main",
        timeoutSeconds: 60,
        maxConcurrent: 1,
      },
      now: new Date("2026-03-10T00:00:00.000Z"),
    });
    const run = await repositories.runs.createQueuedRun({
      sessionId: session.id,
      agentId: "codex-main",
      workspace: "/tmp/workspaces/main",
      prompt: "列出定时任务",
      managementMode: "schedule",
      triggerMessageId: "msg-001",
      triggerUserId: "user-001",
      timeoutSeconds: 60,
      now: new Date("2026-03-10T00:00:00.000Z"),
    });
    await repositories.runs.markRunStarted(run.id, "2026-03-10T00:00:01.000Z");

    let relayCount = 0;
    const bridge = new CodexBridge({
      transport: {
        run() {
          const transportRun = {
            async *stream() {
              yield {
                type: "tool_call" as const,
                toolName: "schedule.list",
                arguments: {
                  workspace: "/tmp/workspaces/main",
                  actionType: "list",
                },
                handledByTransport: true,
              };
              yield {
                type: "tool_result" as const,
                toolName: "schedule.list",
                result: {
                  status: "executed",
                  reason: null,
                  targetDefinitionId: null,
                  summary: "当前 workspace 没有定时任务。",
                },
                handledByTransport: true,
              };
              yield {
                type: "result" as const,
                resultSummary: "当前 workspace 没有定时任务。",
              };
            },
            async submitToolResult() {
              return;
            },
            [Symbol.asyncIterator]() {
              return transportRun.stream()[Symbol.asyncIterator]();
            },
          };
          return transportRun;
        },
      },
      now: () => new Date("2026-03-10T00:00:02.000Z"),
    });

    const controller = createRunController({
      agentConfig: {
        id: "codex-main",
        bridge: "codex",
        defaultWorkspace: "main",
        workspace: "/tmp/workspaces/main",
        timeoutSeconds: 60,
        maxConcurrent: 1,
      },
      repositories,
      cancelSignals: new CancelSignalStore(),
      heartbeats: new HeartbeatMonitor({ ttlMs: 1_000 }),
      bridge,
      toolInvoker: {
        async execute() {
          relayCount += 1;
          return {
            status: "executed",
            summary: "unexpected relay",
          };
        },
      },
      notifier: {
        async notifyRunEvent() {
          return;
        },
      },
      now: () => new Date("2026-03-10T00:00:02.000Z"),
    });

    await controller.execute({
      ...(await repositories.runs.getRunById(run.id))!,
    });

    expect(relayCount).toBe(0);
    const events = await repositories.events.listEventsByRun(run.id);
    expect(events.map((event) => event.eventType)).toEqual([
      "agent.tool_call",
      "agent.tool_result",
      "run.completed",
    ]);
  });
});
