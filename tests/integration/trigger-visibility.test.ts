import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("trigger visibility integration", () => {
  test("delivery failure 与 run completed 在内部查询面分离展示", async () => {
    const harness = createHarness({
      delivery: {
        failSendMessage: true,
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
    });

    await harness.syncTriggerDefinitions();
    harness.advanceTime(61_000);
    await harness.scheduler.runOnce();
    await harness.executor.processNext();

    const execution = (await harness.repositories.triggerExecutions.listExecutions()).at(-1);
    const response = await harness.getInternalTriggers(`/internal/triggers/executions/${execution?.id}`);
    const body = await response.json();

    expect(body.execution).toEqual(
      expect.objectContaining({
        status: "completed",
        operatorStatus: "delivery_failed",
        deliveryStatus: "failed",
        run: expect.objectContaining({
          status: "completed",
        }),
      }),
    );
  });

  test("heartbeat expiry 在内部查询面可见且不依赖聊天 session", async () => {
    const harness = createHarness({
      heartbeatTtlMs: 1_000,
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
              kind: "none",
            },
          },
        ],
      },
    });

    await harness.syncTriggerDefinitions();
    harness.advanceTime(61_000);
    await harness.scheduler.runOnce();

    const run = (await harness.repositories.runs.listRuns()).at(-1);
    const execution = (await harness.repositories.triggerExecutions.listExecutions()).at(-1);
    await harness.queue.dequeue(harness.agentConfig.workspace);
    await harness.repositories.runs.markRunStarted(run?.id ?? "", "2026-03-08T00:01:01.000Z");
    await harness.repositories.triggerExecutions.updateExecution({
      executionId: execution?.id ?? "",
      status: "running",
      runId: run?.id ?? "",
      now: new Date("2026-03-08T00:01:01.000Z"),
    });
    await harness.workspaceLocks.acquire(harness.agentConfig.workspace, run?.id ?? "");
    await harness.heartbeats.beat(run?.id ?? "", Date.parse("2026-03-08T00:01:01.000Z"));

    harness.advanceTime(2_000);
    await harness.reaper.reapExpiredRuns();

    const response = await harness.getInternalTriggers(`/internal/triggers/executions/${execution?.id}`);
    const body = await response.json();

    expect(body.execution).toEqual(
      expect.objectContaining({
        status: "failed",
        operatorStatus: "heartbeat_expired",
        run: expect.objectContaining({
          status: "failed",
          failureCode: "heartbeat_expired",
        }),
      }),
    );
  });

  test("内部查询面的 sync 不会擦掉已经到点的 scheduled window", async () => {
    const harness = createHarness({
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
              kind: "none",
            },
          },
        ],
      },
    });

    await harness.syncTriggerDefinitions();
    harness.advanceTime(61_000);

    const before = await harness.getInternalTriggers();
    expect(before.status).toBe(200);

    const definitionAfterRead = await harness.repositories.triggerDefinitions.getDefinitionById("daily-report");
    expect(definitionAfterRead?.nextDueAt).toBe("2026-03-08T00:01:00.000Z");

    await harness.scheduler.runOnce();

    const execution = (await harness.repositories.triggerExecutions.listExecutions()).at(-1);
    expect(execution).toMatchObject({
      status: "queued",
      triggeredAt: "2026-03-08T00:01:00.000Z",
    });
  });
});
