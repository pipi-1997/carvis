import { describe, expect, test } from "bun:test";

import { TEST_AGENT_CONFIG, createHarness } from "../support/harness.ts";

describe("external webhook integration", () => {
  test("accepted webhook 进入 sessionless run 并发送终态 delivery", async () => {
    const harness = createHarness({
      triggerConfig: {
        webhooks: [
          {
            id: "build-failed",
            enabled: true,
            slug: "build-failed",
            workspace: TEST_AGENT_CONFIG.defaultWorkspace,
            agentId: TEST_AGENT_CONFIG.id,
            promptTemplate: "分析 {{summary}} @ {{branch}}",
            requiredFields: ["summary"],
            optionalFields: ["branch"],
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

    const response = await harness.postExternalWebhook(
      "build-failed",
      {
        summary: "main branch CI failed",
        branch: "main",
        workspace: "/tmp/ignored",
      },
      {
        secret: "build-secret",
      },
    );
    expect(response.status).toBe(202);

    const queuedRun = (await harness.repositories.runs.listRuns()).at(-1);
    expect(queuedRun).toMatchObject({
      sessionId: null,
      triggerSource: "external_webhook",
      requestedSessionMode: "fresh",
      deliveryTarget: {
        kind: "feishu_chat",
        chatId: "ops-chat",
      },
    });

    await harness.executor.processNext();

    const execution = await harness.repositories.triggerExecutions.getExecutionByRunId(queuedRun?.id ?? "");
    expect(harness.bridgeRequests.at(-1)).toMatchObject({
      sessionId: null,
    });
    expect(harness.bridgeRequests.at(-1)?.prompt).toContain("分析 main branch CI failed @ main");
    expect(execution).toMatchObject({
      status: "completed",
      deliveryStatus: "sent",
    });
    expect(harness.presentationOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "create-card", chatId: "ops-chat", runId: queuedRun?.id }),
        expect.objectContaining({ action: "complete-card", runId: queuedRun?.id, status: "completed" }),
      ]),
    );
    expect(harness.sentMessages.at(-1)).toBeUndefined();
  });

  test("payload 只能注入允许字段，不能覆盖 definition 绑定 workspace", async () => {
    const harness = createHarness({
      triggerConfig: {
        webhooks: [
          {
            id: "build-failed",
            enabled: true,
            slug: "build-failed",
            workspace: TEST_AGENT_CONFIG.defaultWorkspace,
            agentId: TEST_AGENT_CONFIG.id,
            promptTemplate: "workspace? {{workspace}} summary={{summary}}",
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

    await harness.postExternalWebhook(
      "build-failed",
      {
        summary: "CI failed",
        workspace: "overridden",
      },
      {
        secret: "build-secret",
      },
    );
    await harness.executor.processNext();

    expect(harness.bridgeRequests.at(-1)).toMatchObject({
      workspace: harness.agentConfig.workspace,
    });
    expect(harness.bridgeRequests.at(-1)?.prompt).toContain("workspace?  summary=CI failed");
  });
});
