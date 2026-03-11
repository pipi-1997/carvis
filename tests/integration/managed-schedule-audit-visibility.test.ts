import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("managed schedule audit visibility", () => {
  test("查询面可区分 management success 与 delivery failure", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-schedule-audit/main";
    const harness = createHarness({
      workspaceResolver: {
        registry: { main: workspace },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-schedule-audit",
      },
      presentation: {
        failCardUpdate: true,
      },
      triggerConfig: {
        scheduledJobs: [
          {
            id: "daily-report",
            enabled: true,
            workspace: "main",
            agentId: "codex-main",
            schedule: "1 0 * * *",
            timezone: null,
            promptTemplate: "生成日报",
            delivery: {
              kind: "feishu_chat",
              chatId: "ops-chat",
            },
          },
        ],
      },
      transportScript: [
        {
          type: "tool_call",
          toolName: "schedule.update",
          arguments: {
            workspace,
            actionType: "update",
            targetReference: "daily-report",
            scheduleExpr: "1 0 * * *",
            promptTemplate: "生成日报",
          },
        },
      ],
    });

    await harness.syncTriggerDefinitions();
    await harness.postFeishuText("把日报改一下");
    await harness.executor.processNext();

    harness.advanceTime(61_000);
    await harness.scheduler.runOnce();
    await harness.executor.processNext();

    const response = await harness.getInternalManagedSchedules(undefined, { workspace });
    const body = await response.json();
    expect(body.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionType: "update",
          resolutionStatus: "executed",
        }),
      ]),
    );
    expect(body.definitions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "daily-report",
          lastManagedResult: "executed",
          latestExecution: expect.objectContaining({
            status: "completed",
            deliveryStatus: "failed",
            run: expect.objectContaining({
              status: "completed",
            }),
            deliveries: expect.arrayContaining([
              expect.objectContaining({
                deliveryKind: "card_complete",
                status: "failed",
              }),
            ]),
          }),
        }),
      ]),
    );
  });

  test("查询面可见 needs_clarification 的管理动作", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-schedule-audit-clarify/main";
    const harness = createHarness({
      workspaceResolver: {
        registry: { main: workspace },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-schedule-audit-clarify",
      },
      triggerConfig: {
        scheduledJobs: [
          {
            id: "report-a",
            enabled: true,
            workspace: "main",
            agentId: "codex-main",
            schedule: "0 9 * * *",
            timezone: null,
            promptTemplate: "生成日报 A",
            delivery: { kind: "none" },
          },
          {
            id: "report-b",
            enabled: true,
            workspace: "main",
            agentId: "codex-main",
            schedule: "0 10 * * *",
            timezone: null,
            promptTemplate: "生成日报 B",
            delivery: { kind: "none" },
          },
        ],
      },
      transportScript: [
        {
          type: "tool_call",
          toolName: "schedule.disable",
          arguments: {
            workspace,
            actionType: "disable",
            targetReference: "日报",
          },
        },
      ],
    });

    await harness.syncTriggerDefinitions();
    await harness.postFeishuText("取消那个日报");
    await harness.executor.processNext();

    const response = await harness.getInternalManagedSchedules(undefined, { workspace });
    const body = await response.json();
    expect(body.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionType: "disable",
          resolutionStatus: "needs_clarification",
          reason: "ambiguous_target",
        }),
      ]),
    );
  });
});
