import { describe, expect, test } from "bun:test";

import { createCliDrivenCodexTransport, createHarness } from "../support/harness.ts";

describe("Feishu schedule update integration", () => {
  test("唯一匹配的 config definition 会通过 carvis-schedule update 写入 override", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-schedule-update/main";
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-schedule-update",
      },
      triggerConfig: {
        scheduledJobs: [
          {
            id: "daily-report",
            enabled: true,
            workspace: "main",
            agentId: "codex-main",
            schedule: "0 9 * * *",
            timezone: "Asia/Shanghai",
            promptTemplate: "生成日报",
            delivery: { kind: "none" },
          },
        ],
      },
      transportFactory: ({ gateway }) => createCliDrivenCodexTransport({
        fetchImpl: (input, init) => gateway.request(typeof input === "string" ? input : String(input), init),
        command(contextArgs) {
          return [
            "update",
            ...contextArgs,
            "--target-reference",
            "daily-report",
            "--schedule-expr",
            "0 10 * * *",
            "--timezone",
            "Asia/Shanghai",
            "--prompt-template",
            "生成日报",
          ];
        },
      }),
    });

    await harness.syncTriggerDefinitions();

    const response = await harness.postFeishuText("把日报改成工作日上午 10 点");
    expect(response.status).toBe(202);
    await harness.executor.processNext();

    const effective = await harness.repositories.triggerDefinitions.getEffectiveDefinitionById("daily-report");
    expect(effective).toEqual(
      expect.objectContaining({
        definitionOrigin: "config",
        scheduleExpr: "0 10 * * *",
        overridden: true,
      }),
    );
  });

  test("不会把 external webhook definition 当成可修改的 schedule", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-schedule-update-webhook/main";
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-schedule-update-webhook",
      },
      triggerConfig: {
        webhooks: [
          {
            id: "build-failed",
            slug: "build-failed",
            enabled: true,
            workspace: "main",
            agentId: "codex-main",
            promptTemplate: "处理外部构建失败 webhook",
            delivery: { kind: "none" },
            secretEnv: "BUILD_FAILED_SECRET",
            secret: "build-failed-secret",
            requiredFields: [],
            optionalFields: ["branch"],
            replayWindowSeconds: 300,
          },
        ],
      },
      transportFactory: ({ gateway }) => createCliDrivenCodexTransport({
        fetchImpl: (input, init) => gateway.request(typeof input === "string" ? input : String(input), init),
        command(contextArgs) {
          return [
            "update",
            ...contextArgs,
            "--target-reference",
            "build-failed",
            "--schedule-expr",
            "0 10 * * *",
            "--timezone",
            "Asia/Shanghai",
          ];
        },
      }),
    });

    await harness.syncTriggerDefinitions();
    await harness.postFeishuText("把 build-failed 改成每天 10 点");
    await harness.executor.processNext();

    const response = await harness.getInternalManagedSchedules(undefined, {
      workspace: harness.agentConfig.workspace,
    });
    const body = await response.json();
    expect(body.actions.at(-1)).toEqual(
      expect.objectContaining({
        actionType: "update",
        resolutionStatus: "rejected",
        reason: "target_not_found",
      }),
    );
  });
});
