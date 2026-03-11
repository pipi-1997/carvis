import { describe, expect, test } from "bun:test";

import { createCliDrivenCodexTransport, createHarness } from "../support/harness.ts";

describe("Feishu schedule list integration", () => {
  test("当前 workspace 的 carvis-schedule list 会返回 config 与 agent definitions", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-schedule-list/main";
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-schedule-list",
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
      transportFactory: ({ gateway }) => createCliDrivenCodexTransport({
        fetchImpl: (input, init) => gateway.request(typeof input === "string" ? input : String(input), init),
        command(contextArgs) {
          return [
            "list",
            ...contextArgs,
          ];
        },
      }),
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
      nextDueAt: "2026-03-08T00:30:00.000Z",
      lastTriggeredAt: null,
      lastTriggerStatus: null,
      lastManagedAt: "2026-03-08T00:00:00.000Z",
      lastManagedBySessionId: "session-001",
      lastManagedByChatId: "chat-001",
      lastManagementAction: "create",
      secretRef: null,
      requiredFields: [],
      optionalFields: [],
      replayWindowSeconds: null,
      definitionHash: null,
      now: new Date("2026-03-08T00:00:00.000Z"),
    });

    const response = await harness.postFeishuText("我现在有哪些定时任务");
    expect(response.status).toBe(202);
    await harness.executor.processNext();

    const managedResponse = await harness.getInternalManagedSchedules(undefined, {
      workspace,
    });
    const body = await managedResponse.json();
    expect(body.definitions.map((definition: { label: string }) => definition.label).sort()).toEqual([
      "Agent 巡检",
      "daily-report",
    ]);
  });
});
