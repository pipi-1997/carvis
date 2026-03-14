import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("trigger lifecycle contract", () => {
  test("scheduled job 经过 queued -> running -> completed", async () => {
    const harness = createHarness({
      workspaceResolver: {
        sandboxModes: {
          main: "danger-full-access",
        },
      },
      triggerConfig: {
        scheduledJobs: [
          {
            id: "daily-report",
            enabled: true,
            workspace: "main",
            agentId: harnesslessAgentId(),
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

    let execution = (await harness.repositories.triggerExecutions.listExecutions()).at(-1);
    expect(execution).toMatchObject({
      status: "queued",
      sourceType: "scheduled_job",
    });

    await harness.executor.processNext();

    execution = (await harness.repositories.triggerExecutions.listExecutions()).at(-1);
    expect(execution).toMatchObject({
      status: "completed",
      sourceType: "scheduled_job",
    });
    expect((await harness.repositories.runs.listRuns()).at(-1)).toMatchObject({
      sessionId: null,
      triggerSource: "scheduled_job",
      resolvedSandboxMode: "danger-full-access",
      sandboxModeSource: "workspace_default",
      requestedSessionMode: "fresh",
      status: "completed",
    });
  });

  test("workspace 已有活动运行时 scheduled job 保持 FIFO 排队", async () => {
    const harness = createHarness({
      triggerConfig: {
        scheduledJobs: [
          {
            id: "daily-report",
            enabled: true,
            workspace: "main",
            agentId: harnesslessAgentId(),
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

    const runningRun = await harness.repositories.runs.createQueuedRun({
      sessionId: null,
      agentId: harness.agentConfig.id,
      workspace: harness.agentConfig.workspace,
      prompt: "正在执行中的任务",
      triggerSource: "chat_message",
      triggerExecutionId: null,
      triggerMessageId: "msg-001",
      triggerUserId: "user-001",
      timeoutSeconds: harness.agentConfig.timeoutSeconds,
      requestedSessionMode: "fresh",
      requestedBridgeSessionId: null,
    });
    await harness.repositories.runs.markRunStarted(runningRun.id, "2026-03-08T00:00:30.000Z");
    await harness.workspaceLocks.acquire(harness.agentConfig.workspace, runningRun.id);

    await harness.syncTriggerDefinitions();
    harness.advanceTime(61_000);
    await harness.scheduler.runOnce();

    const queuedRun = (await harness.repositories.runs.listRuns()).find((run) => run.id !== runningRun.id);
    expect(queuedRun).toMatchObject({
      status: "queued",
      queuePosition: 1,
      triggerSource: "scheduled_job",
    });
  });
});

function harnesslessAgentId() {
  return "codex-main";
}
