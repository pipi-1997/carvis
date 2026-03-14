import { describe, expect, test } from "bun:test";

import { TEST_AGENT_CONFIG, createHarness } from "../support/harness.ts";

describe("trigger visibility contract", () => {
  test("内部查询面返回 definitions 列表", async () => {
    const harness = createHarness({
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

    const response = await harness.getInternalTriggers();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      definitions: [
        expect.objectContaining({
          id: "build-failed",
          slug: "build-failed",
          enabled: true,
        }),
      ],
    });
  });

  test("execution 查询能区分 heartbeat_expired 与 delivery_failed", async () => {
    const harness = createHarness({
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
              kind: "feishu_chat",
              chatId: "ops-chat",
            },
          },
        ],
      },
    });

    await harness.syncTriggerDefinitions();
    await harness.postExternalWebhook(
      "build-failed",
      { summary: "CI failed" },
      { secret: "build-secret" },
    );
    await harness.executor.processNext();

    const completedExecution = (await harness.repositories.triggerExecutions.listExecutions()).at(-1);
    await harness.repositories.triggerExecutions.updateExecution({
      executionId: completedExecution?.id ?? "",
      deliveryStatus: "failed",
      now: new Date("2026-03-08T00:02:00.000Z"),
    });

    const deliveryResponse = await harness.getInternalTriggers(
      `/internal/triggers/executions/${completedExecution?.id}`,
    );
    const deliveryBody = await deliveryResponse.json();

    expect(deliveryBody.execution).toEqual(
      expect.objectContaining({
        operatorStatus: "delivery_failed",
      }),
    );

    const heartbeatExecution = await harness.repositories.triggerExecutions.createExecution({
      definitionId: "build-failed",
      sourceType: "external_webhook",
      status: "failed",
      triggeredAt: "2026-03-08T00:03:00.000Z",
      failureCode: "heartbeat_expired",
      failureMessage: "executor heartbeat expired",
      finishedAt: "2026-03-08T00:03:30.000Z",
    });
    const heartbeatResponse = await harness.getInternalTriggers(
      `/internal/triggers/executions/${heartbeatExecution.id}`,
    );
    const heartbeatBody = await heartbeatResponse.json();

    expect(heartbeatBody.execution).toEqual(
      expect.objectContaining({
        operatorStatus: "heartbeat_expired",
        failureCode: "heartbeat_expired",
      }),
    );
  });

  test("execution 查询会暴露 run 的 sandbox mode 与来源", async () => {
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

    await harness.postExternalWebhook("build-failed", { summary: "CI failed" }, { secret: "build-secret" });
    const execution = (await harness.repositories.triggerExecutions.listExecutions()).at(-1);
    const response = await harness.getInternalTriggers(`/internal/triggers/executions/${execution?.id}`);
    const body = await response.json();

    expect(body.execution.run).toEqual(
      expect.objectContaining({
        resolvedSandboxMode: "danger-full-access",
        sandboxModeSource: "workspace_default",
      }),
    );
  });
});
