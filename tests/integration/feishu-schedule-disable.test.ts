import { describe, expect, test } from "bun:test";

import { createCliDrivenCodexTransport, createHarness } from "../support/harness.ts";

describe("Feishu schedule disable integration", () => {
  test("carvis-schedule disable 后 effective definition 变为 disabled，后续 scheduler 不再触发", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-schedule-disable/main";
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-schedule-disable",
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
            delivery: { kind: "none" },
          },
        ],
      },
      transportFactory: ({ gateway }) => createCliDrivenCodexTransport({
        fetchImpl: (input, init) => gateway.request(typeof input === "string" ? input : String(input), init),
        command(contextArgs) {
          return [
            "disable",
            ...contextArgs,
            "--target-reference",
            "daily-report",
          ];
        },
      }),
    });

    await harness.syncTriggerDefinitions();
    const response = await harness.postFeishuText("取消每天巡检");
    expect(response.status).toBe(202);
    await harness.executor.processNext();

    const effective = await harness.repositories.triggerDefinitions.getEffectiveDefinitionById("daily-report");
    expect(effective?.enabled).toBe(false);

    harness.advanceTime(61_000);
    await harness.scheduler.runOnce();
    const executions = await harness.repositories.triggerExecutions.listExecutions();
    expect(executions).toHaveLength(1);
    expect(executions[0]?.status).toBe("skipped");
  });
});
