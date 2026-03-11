import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("schedule management list contract", () => {
  test("schedule.list 只返回当前 workspace 的 effective schedules，并暴露 origin、nextDueAt 与最近执行状态", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-list-contract/main";
    const otherWorkspace = "/tmp/carvis-managed-workspaces-list-contract/other";
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
          other: otherWorkspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-list-contract",
      },
      triggerConfig: {
        scheduledJobs: [
          {
            id: "daily-report",
            enabled: true,
            workspace: "main",
            agentId: "codex-main",
            schedule: "0 9 * * *",
            timezone: "Asia/Shanghai",
            promptTemplate: "生成日报",
            delivery: { kind: "none" },
          },
          {
            id: "other-report",
            enabled: true,
            workspace: "other",
            agentId: "codex-main",
            schedule: "0 11 * * *",
            timezone: "Asia/Shanghai",
            promptTemplate: "生成其他日报",
            delivery: { kind: "none" },
          },
        ],
      },
    });

    await harness.syncTriggerDefinitions();
    await harness.repositories.triggerDefinitions.upsertDefinition({
      id: "agent-scan",
      sourceType: "scheduled_job",
      definitionOrigin: "agent",
      slug: null,
      enabled: true,
      workspace,
      agentId: "codex-main",
      label: "Agent 巡检",
      promptTemplate: "执行 agent 巡检",
      deliveryTarget: { kind: "none" },
      scheduleExpr: "*/30 * * * *",
      timezone: null,
      nextDueAt: "2026-03-10T00:30:00.000Z",
      lastTriggeredAt: "2026-03-10T00:00:00.000Z",
      lastTriggerStatus: "completed",
      lastManagedAt: "2026-03-10T00:00:00.000Z",
      lastManagedBySessionId: "session-001",
      lastManagedByChatId: "chat-001",
      lastManagementAction: "create",
      secretRef: null,
      requiredFields: [],
      optionalFields: [],
      replayWindowSeconds: null,
      definitionHash: null,
      now: new Date("2026-03-10T00:00:00.000Z"),
    });

    const response = await harness.gateway.request("http://localhost/internal/run-tools/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        toolName: "schedule.list",
        invocation: {
          workspace,
          actionType: "list",
        },
        workspace,
        sessionId: "session-001",
        chatId: "chat-001",
        userId: "user-001",
        requestedText: "我现在有哪些定时任务",
      }),
    });
    const body = await response.json() as { result: { summary: string; status: string } };

    expect(response.status).toBe(200);
    expect(body.result.status).toBe("executed");
    expect(body.result.summary).toContain("daily-report | config | enabled | next=");
    expect(body.result.summary).toContain("| last=never | 0 9 * * *");
    expect(body.result.summary).toContain("Agent 巡检 | agent | enabled | next=2026-03-10T00:30:00.000Z | last=completed | */30 * * * *");
    expect(body.result.summary).not.toContain("other-report");
  });
});
