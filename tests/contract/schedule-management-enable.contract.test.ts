import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("schedule management enable contract", () => {
  test("schedule.enable 命中唯一目标时必须写入 enabled override", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-enable-contract/main";
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-enable-contract",
      },
      triggerConfig: {
        scheduledJobs: [
          {
            id: "daily-report",
            enabled: false,
            workspace: "main",
            agentId: "codex-main",
            schedule: "1 0 * * *",
            timezone: null,
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
        toolName: "schedule.enable",
        invocation: {
          workspace,
          actionType: "enable",
          targetReference: "daily-report",
        },
        workspace,
        sessionId: "session-001",
        chatId: "chat-001",
        userId: "user-001",
        requestedText: "启用每日巡检",
      }),
    });
    const body = await response.json() as { result: Record<string, unknown> };

    expect(body.result).toEqual({
      status: "executed",
      reason: null,
      targetDefinitionId: "daily-report",
      summary: "已启用定时任务：daily-report",
    });
    expect(await harness.repositories.triggerDefinitionOverrides.listOverrides()).toEqual([
      expect.objectContaining({
        definitionId: "daily-report",
        enabled: true,
      }),
    ]);
  });
});

