import { describe, expect, test } from "bun:test";

import { TEST_AGENT_CONFIG, createHarness } from "../support/harness.ts";

describe("trigger sandbox mode default integration", () => {
  test("scheduled job 按 workspace 默认 sandbox mode 执行", async () => {
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
            workspace: TEST_AGENT_CONFIG.defaultWorkspace,
            agentId: TEST_AGENT_CONFIG.id,
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

    const queuedRun = (await harness.repositories.runs.listRuns()).at(-1);
    expect(queuedRun).toMatchObject({
      triggerSource: "scheduled_job",
      resolvedSandboxMode: "danger-full-access",
      sandboxModeSource: "workspace_default",
    });

    await harness.executor.processNext();

    expect(harness.bridgeRequests.at(-1)).toMatchObject({
      resolvedSandboxMode: "danger-full-access",
    });
  });

  test("external webhook 按 workspace 默认 sandbox mode 执行", async () => {
    const harness = createHarness({
      workspaceResolver: {
        sandboxModes: {
          main: "danger-full-access",
        },
      },
      triggerConfig: {
        webhooks: [
          {
            id: "build-failed",
            enabled: true,
            slug: "build-failed",
            workspace: TEST_AGENT_CONFIG.defaultWorkspace,
            agentId: TEST_AGENT_CONFIG.id,
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

    const response = await harness.postExternalWebhook(
      "build-failed",
      {
        summary: "CI failed",
      },
      {
        secret: "build-secret",
      },
    );
    expect(response.status).toBe(202);

    const queuedRun = (await harness.repositories.runs.listRuns()).at(-1);
    expect(queuedRun).toMatchObject({
      triggerSource: "external_webhook",
      resolvedSandboxMode: "danger-full-access",
      sandboxModeSource: "workspace_default",
    });

    await harness.executor.processNext();

    expect(harness.bridgeRequests.at(-1)).toMatchObject({
      resolvedSandboxMode: "danger-full-access",
    });
  });
});
