import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("internal managed schedules contract", () => {
  test("内部查询面返回 definitions 与 actions，并按 workspace 过滤", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-internal-managed/main";
    const otherWorkspace = "/tmp/carvis-managed-workspaces-internal-managed/other";
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
          other: otherWorkspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-internal-managed",
      },
    });

    for (const definition of [
      { id: "daily-report", workspace, label: "日报" },
      { id: "other-report", workspace: otherWorkspace, label: "其他日报" },
    ]) {
      await harness.repositories.triggerDefinitions.upsertDefinition({
        id: definition.id,
        sourceType: "scheduled_job",
        definitionOrigin: "agent",
        slug: null,
        enabled: true,
        workspace: definition.workspace,
        agentId: "codex-main",
        label: definition.label,
        promptTemplate: `生成${definition.label}`,
        deliveryTarget: { kind: "none" },
        scheduleExpr: "0 9 * * *",
        timezone: "Asia/Shanghai",
        nextDueAt: "2026-03-10T01:00:00.000Z",
        lastTriggeredAt: null,
        lastTriggerStatus: null,
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
    }
    await harness.repositories.scheduleManagementActions.createAction({
      sessionId: "session-001",
      chatId: "chat-001",
      workspace,
      userId: "user-001",
      requestedText: "每天 9 点生成日报",
      actionType: "create",
      resolutionStatus: "executed",
      targetDefinitionId: "daily-report",
      reason: null,
      responseSummary: "已创建定时任务：日报",
      now: new Date("2026-03-10T00:00:00.000Z"),
    });
    await harness.repositories.scheduleManagementActions.createAction({
      sessionId: "session-002",
      chatId: "chat-002",
      workspace: otherWorkspace,
      userId: "user-002",
      requestedText: "每天 9 点生成其他日报",
      actionType: "create",
      resolutionStatus: "executed",
      targetDefinitionId: "other-report",
      reason: null,
      responseSummary: "已创建定时任务：其他日报",
      now: new Date("2026-03-10T00:00:00.000Z"),
    });

    const response = await harness.getInternalManagedSchedules(undefined, {
      workspace,
    });
    const body = await response.json() as {
      ok: boolean;
      actions: Array<Record<string, unknown>>;
      definitions: Array<Record<string, unknown>>;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.definitions).toEqual([
      expect.objectContaining({
        definitionId: "daily-report",
        workspace,
        label: "日报",
        latestAction: expect.objectContaining({
          actionType: "create",
          responseSummary: "已创建定时任务：日报",
        }),
      }),
    ]);
    expect(body.actions).toEqual([
      expect.objectContaining({
        workspace,
        targetDefinitionId: "daily-report",
      }),
    ]);
  });
});
