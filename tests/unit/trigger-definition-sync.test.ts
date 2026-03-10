import { describe, expect, test } from "bun:test";

import { createTriggerDefinitionSync } from "../../apps/gateway/src/services/trigger-definition-sync.ts";
import { createInMemoryRepositories } from "../../packages/core/src/storage/repositories.ts";

describe("trigger definition sync", () => {
  test("同步 runtime config 到仓储并保留历史执行状态", async () => {
    const repositories = createInMemoryRepositories();
    await repositories.triggerDefinitions.upsertDefinition({
      id: "daily-ops-report",
      sourceType: "scheduled_job",
      slug: null,
      enabled: true,
      workspace: "ops",
      agentId: "codex-main",
      promptTemplate: "旧模板",
      deliveryTarget: {
        kind: "none",
      },
      scheduleExpr: "0 8 * * *",
      timezone: null,
      nextDueAt: "2026-03-10T08:00:00.000Z",
      lastTriggeredAt: "2026-03-09T08:00:00.000Z",
      lastTriggerStatus: "completed",
      secretRef: null,
      requiredFields: [],
      optionalFields: [],
      replayWindowSeconds: null,
      definitionHash: "old-hash",
      now: new Date("2026-03-10T07:00:00.000Z"),
    });

    const sync = createTriggerDefinitionSync({
      config: {
        scheduledJobs: [
          {
            id: "daily-ops-report",
            enabled: false,
            workspace: "ops",
            agentId: "codex-main",
            schedule: "0 9 * * *",
            timezone: null,
            promptTemplate: "新模板",
            delivery: {
              kind: "none",
            },
          },
        ],
        webhooks: [],
      },
      repositories,
      workspaceResolverConfig: {
        registry: {
          ops: "/tmp/carvis-ops",
        },
        chatBindings: {},
        managedWorkspaceRoot: "/tmp/carvis-managed",
        templatePath: "/tmp/carvis-template",
      },
      now: () => new Date("2026-03-10T07:00:00.000Z"),
    });

    const result = await sync.syncDefinitions();
    const definition = await repositories.triggerDefinitions.getDefinitionById("daily-ops-report");

    expect(result.createdOrUpdated).toEqual(["daily-ops-report"]);
    expect(definition?.enabled).toBe(false);
    expect(definition?.promptTemplate).toBe("新模板");
    expect(definition?.lastTriggeredAt).toBe("2026-03-09T08:00:00.000Z");
    expect(definition?.lastTriggerStatus).toBe("completed");
  });

  test("不会覆盖已经到点但尚未被 scheduler 消费的 nextDueAt", async () => {
    const repositories = createInMemoryRepositories();
    await repositories.triggerDefinitions.upsertDefinition({
      id: "daily-ops-report",
      sourceType: "scheduled_job",
      slug: null,
      enabled: true,
      workspace: "ops",
      agentId: "codex-main",
      promptTemplate: "旧模板",
      deliveryTarget: {
        kind: "none",
      },
      scheduleExpr: "0 9 * * *",
      timezone: null,
      nextDueAt: "2026-03-10T09:00:00.000Z",
      lastTriggeredAt: "2026-03-09T09:00:00.000Z",
      lastTriggerStatus: "completed",
      secretRef: null,
      requiredFields: [],
      optionalFields: [],
      replayWindowSeconds: null,
      definitionHash: "old-hash",
      now: new Date("2026-03-10T08:00:00.000Z"),
    });

    const sync = createTriggerDefinitionSync({
      config: {
        scheduledJobs: [
          {
            id: "daily-ops-report",
            enabled: true,
            workspace: "ops",
            agentId: "codex-main",
            schedule: "0 9 * * *",
            timezone: null,
            promptTemplate: "新模板",
            delivery: {
              kind: "none",
            },
          },
        ],
        webhooks: [],
      },
      repositories,
      workspaceResolverConfig: {
        registry: {
          ops: "/tmp/carvis-ops",
        },
        chatBindings: {},
        managedWorkspaceRoot: "/tmp/carvis-managed",
        templatePath: "/tmp/carvis-template",
      },
      now: () => new Date("2026-03-10T09:00:30.000Z"),
    });

    await sync.syncDefinitions();
    const definition = await repositories.triggerDefinitions.getDefinitionById("daily-ops-report");

    expect(definition?.nextDueAt).toBe("2026-03-10T09:00:00.000Z");
    expect(definition?.promptTemplate).toBe("新模板");
  });
});
