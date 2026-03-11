import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("schedule management update contract", () => {
  test("schedule.update 必须把 config baseline 更新为 durable override", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-update-contract/main";
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-update-contract",
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
        ],
      },
    });

    await harness.syncTriggerDefinitions();

    const response = await harness.gateway.request("http://localhost/internal/run-tools/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        toolName: "schedule.update",
        invocation: {
          workspace,
          actionType: "update",
          targetReference: "daily-report",
          scheduleExpr: "0 10 * * *",
          timezone: "Asia/Shanghai",
          promptTemplate: "生成日报",
        },
        workspace,
        sessionId: "session-001",
        chatId: "chat-001",
        userId: "user-001",
        requestedText: "把日报改成工作日上午 10 点",
      }),
    });
    const body = await response.json() as { result: Record<string, unknown> };

    const effective = await harness.repositories.triggerDefinitions.getEffectiveDefinitionById("daily-report");
    expect(response.status).toBe(200);
    expect(body.result).toEqual({
      status: "executed",
      reason: null,
      targetDefinitionId: "daily-report",
      summary: "已更新定时任务：daily-report",
    });
    expect(effective).toEqual(expect.objectContaining({
      definitionOrigin: "config",
      overridden: true,
      scheduleExpr: "0 10 * * *",
    }));
  });

  test("schedule.update 对不支持的时间表达必须拒绝且不写入 override", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-update-contract-invalid/main";
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-update-contract-invalid",
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
        ],
      },
    });

    await harness.syncTriggerDefinitions();

    const response = await harness.gateway.request("http://localhost/internal/run-tools/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        toolName: "schedule.update",
        invocation: {
          workspace,
          actionType: "update",
          targetReference: "daily-report",
          scheduleExpr: "明天早上 9 点",
          timezone: "Asia/Shanghai",
        },
        workspace,
        sessionId: "session-001",
        chatId: "chat-001",
        userId: "user-001",
        requestedText: "把日报改成明天早上 9 点",
      }),
    });
    const body = await response.json() as { result: Record<string, unknown> };

    expect(body.result).toEqual({
      status: "rejected",
      reason: "unsupported_schedule",
      targetDefinitionId: "daily-report",
      summary: "不支持该时间表达，请改成当前调度器支持的 cron 形式。",
    });
    expect(await harness.repositories.triggerDefinitionOverrides.listOverrides()).toHaveLength(0);
  });
});
