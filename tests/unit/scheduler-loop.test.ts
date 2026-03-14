import { describe, expect, test } from "bun:test";

import { createSchedulerLoop, computeNextScheduledAt } from "../../apps/gateway/src/services/scheduler-loop.ts";
import { createTriggerDispatcher } from "../../apps/gateway/src/services/trigger-dispatcher.ts";
import { createInMemoryRepositories } from "../../packages/core/src/storage/repositories.ts";
import { RunQueue } from "../../packages/core/src/runtime/queue.ts";
import { TEST_AGENT_CONFIG } from "../support/harness.ts";

describe("scheduler loop", () => {
  test("按 UTC cron 计算下一次触发时间", () => {
    expect(computeNextScheduledAt("0 9 * * *", new Date("2026-03-10T08:30:00.000Z"), null)).toBe(
      "2026-03-10T09:00:00.000Z",
    );
  });

  test("按 timezone cron 计算下一次触发时间", () => {
    expect(computeNextScheduledAt("0 9 * * *", new Date("2026-03-10T00:30:00.000Z"), "Asia/Shanghai")).toBe(
      "2026-03-10T01:00:00.000Z",
    );
  });

  test("错过 dispatch window 时记录 missed 并推进 nextDueAt", async () => {
    const repositories = createInMemoryRepositories();
    await repositories.triggerDefinitions.upsertDefinition({
      id: "daily-report",
      sourceType: "scheduled_job",
      slug: null,
      enabled: true,
      workspace: "/tmp/carvis/main",
      agentId: TEST_AGENT_CONFIG.id,
      promptTemplate: "生成日报",
      deliveryTarget: {
        kind: "none",
      },
      scheduleExpr: "0 9 * * *",
      timezone: null,
      nextDueAt: "2026-03-10T09:00:00.000Z",
      lastTriggeredAt: null,
      lastTriggerStatus: null,
      secretRef: null,
      requiredFields: [],
      optionalFields: [],
      replayWindowSeconds: null,
      definitionHash: "hash-1",
      now: new Date("2026-03-10T08:00:00.000Z"),
    });

    const scheduler = createSchedulerLoop({
      dispatchWindowMs: 60_000,
      now: () => new Date("2026-03-10T09:05:00.000Z"),
      repositories,
      triggerDispatcher: createTriggerDispatcher({
        agentConfig: TEST_AGENT_CONFIG,
        notifier: {
          notifyRunEvent: async () => {},
        },
        queue: new RunQueue(),
        repositories,
        workspaceResolverConfig: {
          registry: {
            main: "/tmp/carvis/main",
          },
          chatBindings: {},
          sandboxModes: {
            main: "workspace-write",
          },
          managedWorkspaceRoot: "/tmp/carvis",
          templatePath: "/tmp/carvis-template",
        },
        now: () => new Date("2026-03-10T09:05:00.000Z"),
      }),
    });

    const result = await scheduler.runOnce();
    const definition = await repositories.triggerDefinitions.getDefinitionById("daily-report");
    const executions = await repositories.triggerExecutions.listExecutionsByDefinition("daily-report");

    expect(result).toEqual({
      dispatched: [],
      missed: ["daily-report"],
      skipped: [],
      syncedNextDue: [],
    });
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({
      status: "missed",
      triggeredAt: "2026-03-10T09:00:00.000Z",
    });
    expect(definition?.nextDueAt).toBe("2026-03-11T09:00:00.000Z");
    expect(definition?.lastTriggerStatus).toBe("missed");
  });

  test("到期且仍在 dispatch window 内时创建 queued run", async () => {
    const repositories = createInMemoryRepositories();
    await repositories.triggerDefinitions.upsertDefinition({
      id: "daily-report",
      sourceType: "scheduled_job",
      slug: null,
      enabled: true,
      workspace: "/tmp/carvis/main",
      agentId: TEST_AGENT_CONFIG.id,
      promptTemplate: "生成日报",
      deliveryTarget: {
        kind: "none",
      },
      scheduleExpr: "0 9 * * *",
      timezone: null,
      nextDueAt: "2026-03-10T09:00:00.000Z",
      lastTriggeredAt: null,
      lastTriggerStatus: null,
      secretRef: null,
      requiredFields: [],
      optionalFields: [],
      replayWindowSeconds: null,
      definitionHash: "hash-1",
      now: new Date("2026-03-10T08:00:00.000Z"),
    });

    const scheduler = createSchedulerLoop({
      dispatchWindowMs: 60_000,
      now: () => new Date("2026-03-10T09:00:30.000Z"),
      repositories,
      triggerDispatcher: createTriggerDispatcher({
        agentConfig: TEST_AGENT_CONFIG,
        notifier: {
          notifyRunEvent: async () => {},
        },
        queue: new RunQueue(),
        repositories,
        workspaceResolverConfig: {
          registry: {
            main: "/tmp/carvis/main",
          },
          chatBindings: {},
          sandboxModes: {
            main: "workspace-write",
          },
          managedWorkspaceRoot: "/tmp/carvis",
          templatePath: "/tmp/carvis-template",
        },
        now: () => new Date("2026-03-10T09:00:30.000Z"),
      }),
    });

    const result = await scheduler.runOnce();
    const executions = await repositories.triggerExecutions.listExecutionsByDefinition("daily-report");
    const runs = await repositories.runs.listRuns();

    expect(result).toEqual({
      dispatched: ["daily-report"],
      missed: [],
      skipped: [],
      syncedNextDue: [],
    });
    expect(executions[0]).toMatchObject({
      status: "queued",
      runId: runs[0]?.id,
      triggeredAt: "2026-03-10T09:00:00.000Z",
    });
    expect(runs[0]).toMatchObject({
      sessionId: null,
      status: "queued",
      triggerSource: "scheduled_job",
      triggerExecutionId: executions[0]?.id,
    });
  });
});
