import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("trigger shared workspace", () => {
  test("chat message、external webhook 和 scheduled job 共享同一 workspace FIFO", async () => {
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
        webhooks: [
          {
            id: "build-failed",
            enabled: true,
            slug: "build-failed",
            workspace: "main",
            agentId: "codex-main",
            promptTemplate: "分析 {{summary}}",
            requiredFields: ["summary"],
            optionalFields: [],
            secretEnv: "BUILD_FAILED_SECRET",
            secret: "build-secret",
            replayWindowSeconds: 60,
            delivery: {
              kind: "none",
            },
          },
        ],
      },
    });

    await harness.postFeishuText("先跑聊天触发任务");
    const chatRun = (await harness.repositories.runs.listRuns()).at(-1);
    await harness.queue.dequeue(harness.agentConfig.workspace);
    await harness.repositories.runs.markRunStarted(chatRun?.id ?? "", "2026-03-08T00:00:10.000Z");
    await harness.workspaceLocks.acquire(harness.agentConfig.workspace, chatRun?.id ?? "");

    await harness.postExternalWebhook(
      "build-failed",
      { summary: "CI failed" },
      { secret: "build-secret" },
    );
    harness.advanceTime(61_000);
    await harness.scheduler.runOnce();

    const queuedRuns = (await harness.repositories.runs.listRuns()).filter((run) => run.id !== chatRun?.id);
    expect(queuedRuns.map((run) => run.queuePosition)).toEqual([1, 2]);
    expect(queuedRuns.map((run) => run.triggerSource)).toEqual(["external_webhook", "scheduled_job"]);
  });
});
