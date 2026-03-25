import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("scheduler trigger integration", () => {
  test("due scheduled job 完成后会发送一条可见的结果消息，而不是只停留在卡片链路", async () => {
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
              kind: "feishu_chat",
              chatId: "ops-chat",
            },
          },
        ],
      },
    });

    await harness.syncTriggerDefinitions();
    harness.advanceTime(61_000);

    const scan = await harness.scheduler.runOnce();
    expect(scan.dispatched).toEqual(["daily-report"]);

    const queuedExecution = (await harness.repositories.triggerExecutions.listExecutions()).at(-1);
    const queuedRun = (await harness.repositories.runs.listRuns()).at(-1);
    expect(queuedExecution).toMatchObject({
      status: "queued",
      runId: queuedRun?.id,
    });
    expect(queuedRun).toMatchObject({
      triggerSource: "scheduled_job",
      deliveryTarget: {
        kind: "feishu_chat",
        chatId: "ops-chat",
      },
    });

    await harness.executor.processNext();

    const execution = await harness.repositories.triggerExecutions.getExecutionByRunId(queuedRun?.id ?? "");
    const definition = await harness.repositories.triggerDefinitions.getDefinitionById("daily-report");
    expect(execution).toMatchObject({
      status: "completed",
      deliveryStatus: "sent",
    });
    expect(definition).toMatchObject({
      lastTriggerStatus: "completed",
      nextDueAt: "2026-03-09T00:01:00.000Z",
    });
    expect(harness.sentMessages).toEqual([
      expect.objectContaining({
        chatId: "ops-chat",
        kind: "result",
        runId: queuedRun?.id,
      }),
    ]);
    expect(harness.presentationOperations).toEqual([]);
    expect(
      (await harness.repositories.deliveries.listDeliveries())
        .filter((delivery) => delivery.runId === queuedRun?.id)
        .every((delivery) => delivery.triggerExecutionId === execution?.id),
    ).toBe(true);
  });
});
