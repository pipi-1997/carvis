import { describe, expect, test } from "bun:test";

import { TEST_AGENT_CONFIG, createHarness } from "../support/harness.ts";

describe("external webhook contract", () => {
  test("合法请求返回 accepted 响应并附带 executionId", async () => {
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
        branch: "main",
      },
      {
        secret: "build-secret",
      },
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({
      ok: true,
      status: "accepted",
      slug: "build-failed",
      definitionId: "build-failed",
      executionId: expect.any(String),
      runId: expect.any(String),
    });
  });

  test("未知 slug 同步 rejected", async () => {
    const harness = createHarness();

    const response = await harness.postExternalWebhook(
      "unknown",
      {
        summary: "CI failed",
      },
      {
        secret: "ignored",
      },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({
      ok: false,
      status: "rejected",
      reason: "unknown_definition",
    });
  });

  test("签名错误时同步 rejected 且创建 rejected execution", async () => {
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

    const response = await harness.postExternalWebhook(
      "build-failed",
      {
        summary: "CI failed",
      },
      {
        secret: "wrong-secret",
      },
    );
    const body = await response.json();
    const executions = await harness.repositories.triggerExecutions.listExecutions();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      ok: false,
      status: "rejected",
      reason: "invalid_signature",
      executionId: expect.any(String),
    });
    expect(executions.at(-1)).toMatchObject({
      definitionId: "build-failed",
      status: "rejected",
      rejectionReason: "invalid_signature",
    });
  });

  test("非标量 payload 字段会被入口同步 rejected", async () => {
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
            optionalFields: ["branch"],
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
        summary: {
          text: "CI failed",
        },
        branch: "main",
      },
      {
        secret: "build-secret",
      },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      status: "rejected",
      reason: "invalid_field_type:summary",
      executionId: expect.any(String),
    });
  });
});
