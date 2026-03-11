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

  test("config baseline 遇到 Codex override 时保留 baseline 并产出 effective definition", async () => {
    const repositories = createInMemoryRepositories();
    await repositories.triggerDefinitions.upsertDefinition({
      id: "daily-ops-report",
      sourceType: "scheduled_job",
      definitionOrigin: "config",
      slug: null,
      enabled: true,
      workspace: "/tmp/carvis-ops",
      agentId: "codex-main",
      label: "日报",
      promptTemplate: "旧模板",
      deliveryTarget: { kind: "none" },
      scheduleExpr: "0 9 * * *",
      timezone: null,
      nextDueAt: "2026-03-10T09:00:00.000Z",
      lastTriggeredAt: null,
      lastTriggerStatus: null,
      lastManagedAt: "2026-03-09T08:00:00.000Z",
      lastManagedByChatId: "chat-001",
      lastManagedBySessionId: "session-001",
      lastManagementAction: "config_sync",
      secretRef: null,
      requiredFields: [],
      optionalFields: [],
      replayWindowSeconds: null,
      definitionHash: "old-hash",
      now: new Date("2026-03-10T08:00:00.000Z"),
    });
    await repositories.triggerDefinitionOverrides.upsertOverride({
      definitionId: "daily-ops-report",
      workspace: "/tmp/carvis-ops",
      label: "日报-已调整",
      enabled: true,
      scheduleExpr: "0 10 * * *",
      timezone: "Asia/Shanghai",
      promptTemplate: "新模板",
      deliveryTarget: { kind: "none" },
      managedBySessionId: "session-002",
      managedByChatId: "chat-002",
      managedByUserId: "user-002",
      appliedAt: "2026-03-10T08:30:00.000Z",
      now: new Date("2026-03-10T08:30:00.000Z"),
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
            promptTemplate: "旧模板",
            delivery: { kind: "none" },
          },
        ],
        webhooks: [],
      },
      repositories,
      workspaceResolverConfig: {
        registry: { ops: "/tmp/carvis-ops" },
        chatBindings: {},
        managedWorkspaceRoot: "/tmp/carvis-managed",
        templatePath: "/tmp/carvis-template",
      },
      now: () => new Date("2026-03-10T08:45:00.000Z"),
    });

    await sync.syncDefinitions();
    const baseline = await repositories.triggerDefinitions.getDefinitionById("daily-ops-report");
    const effective = await repositories.triggerDefinitions.getEffectiveDefinitionById("daily-ops-report");

    expect(baseline?.label).toBe("日报");
    expect(baseline?.scheduleExpr).toBe("0 9 * * *");
    expect(effective).toEqual(
      expect.objectContaining({
        definitionId: "daily-ops-report",
        definitionOrigin: "config",
        label: "日报-已调整",
        scheduleExpr: "0 10 * * *",
        timezone: "Asia/Shanghai",
        promptTemplate: "新模板",
        overridden: true,
      }),
    );
  });

  test("sync 不会禁用 agent 来源 definition，且 effective list 同时包含 config 和 agent definitions", async () => {
    const repositories = createInMemoryRepositories();
    await repositories.triggerDefinitions.upsertDefinition({
      id: "agent-report",
      sourceType: "scheduled_job",
      definitionOrigin: "agent",
      slug: null,
      enabled: true,
      workspace: "/tmp/carvis-ops",
      agentId: "codex-main",
      label: "Agent 巡检",
      promptTemplate: "agent 模板",
      deliveryTarget: { kind: "none" },
      scheduleExpr: "*/5 * * * *",
      timezone: null,
      nextDueAt: "2026-03-10T08:05:00.000Z",
      lastTriggeredAt: null,
      lastTriggerStatus: null,
      lastManagedAt: "2026-03-10T08:00:00.000Z",
      lastManagedByChatId: "chat-001",
      lastManagedBySessionId: "session-001",
      lastManagementAction: "create",
      secretRef: null,
      requiredFields: [],
      optionalFields: [],
      replayWindowSeconds: null,
      definitionHash: "agent-hash",
      now: new Date("2026-03-10T08:00:00.000Z"),
    });

    const sync = createTriggerDefinitionSync({
      config: {
        scheduledJobs: [
          {
            id: "config-report",
            enabled: true,
            workspace: "ops",
            agentId: "codex-main",
            schedule: "0 9 * * *",
            timezone: null,
            promptTemplate: "config 模板",
            delivery: { kind: "none" },
          },
        ],
        webhooks: [],
      },
      repositories,
      workspaceResolverConfig: {
        registry: { ops: "/tmp/carvis-ops" },
        chatBindings: {},
        managedWorkspaceRoot: "/tmp/carvis-managed",
        templatePath: "/tmp/carvis-template",
      },
      now: () => new Date("2026-03-10T08:00:00.000Z"),
    });

    const result = await sync.syncDefinitions();
    const agentDefinition = await repositories.triggerDefinitions.getDefinitionById("agent-report");
    const effectiveDefinitions = await repositories.triggerDefinitions.listEffectiveDefinitions();

    expect(result.disabled).toEqual([]);
    expect(agentDefinition?.enabled).toBe(true);
    expect(effectiveDefinitions.map((definition) => definition.definitionId).sort()).toEqual([
      "agent-report",
      "config-report",
    ]);
  });
});
