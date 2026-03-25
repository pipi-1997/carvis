import { describe, expect, test } from "bun:test";

import { createTriggerStatusPresenter } from "../../apps/gateway/src/services/trigger-status-presenter.ts";

describe("trigger status presenter", () => {
  test("definitions 查询面对 Date 类型 triggeredAt 也能稳定排序", async () => {
    const presenter = createTriggerStatusPresenter({
      repositories: {
        deliveries: {
          listDeliveries: async () => [],
        },
        runs: {
          listRuns: async () => [],
        },
        triggerDefinitions: {
          listDefinitions: async () => [
            {
              id: "daily-report",
              sourceType: "scheduled_job",
              slug: "daily-report",
              enabled: true,
              workspace: "/tmp/carvis/main",
              agentId: "codex-main",
              promptTemplate: "生成日报",
              deliveryTarget: { kind: "none" },
              scheduleExpr: "0 9 * * *",
              timezone: "Asia/Shanghai",
              nextDueAt: "2026-03-26T00:00:00.000Z",
              lastTriggeredAt: "2026-03-25T00:00:00.000Z",
              lastTriggerStatus: "completed",
            },
          ],
        },
        triggerExecutions: {
          listExecutions: async () => [
            {
              id: "execution-latest",
              definitionId: "daily-report",
              sourceType: "scheduled_job",
              status: "completed",
              triggeredAt: new Date("2026-03-25T00:00:00.000Z"),
              inputDigest: "digest-latest",
              runId: null,
              deliveryStatus: "not_requested",
              rejectionReason: null,
              failureCode: null,
              failureMessage: null,
              finishedAt: "2026-03-25T00:01:00.000Z",
            },
            {
              id: "execution-earlier",
              definitionId: "daily-report",
              sourceType: "scheduled_job",
              status: "completed",
              triggeredAt: new Date("2026-03-24T00:00:00.000Z"),
              inputDigest: "digest-earlier",
              runId: null,
              deliveryStatus: "not_requested",
              rejectionReason: null,
              failureCode: null,
              failureMessage: null,
              finishedAt: "2026-03-24T00:01:00.000Z",
            },
          ],
        },
      } as never,
    });

    const definitions = await presenter.listDefinitions();

    expect(definitions[0]?.recentExecutions).toEqual([
      expect.objectContaining({
        id: "execution-latest",
        triggeredAt: "2026-03-25T00:00:00.000Z",
      }),
      expect.objectContaining({
        id: "execution-earlier",
        triggeredAt: "2026-03-24T00:00:00.000Z",
      }),
    ]);
  });
});
