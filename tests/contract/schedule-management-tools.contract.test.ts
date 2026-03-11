import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

async function executeTool(
  harness: ReturnType<typeof createHarness>,
  payload: Record<string, unknown>,
) {
  const response = await harness.gateway.request("http://localhost/internal/run-tools/execute", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return {
    response,
    body: await response.json() as { ok: boolean; result: Record<string, unknown> },
  };
}

describe("schedule management tools contract", () => {
  test("schedule.create 必须拒绝跨 workspace 管理", async () => {
    const harness = createHarness();

    const { response, body } = await executeTool(harness, {
      toolName: "schedule.create",
      invocation: {
        workspace: "/tmp/other-workspace",
        actionType: "create",
        label: "日报",
        scheduleExpr: "0 9 * * *",
        timezone: "Asia/Shanghai",
        promptTemplate: "生成日报",
      },
      workspace: harness.agentConfig.workspace,
      sessionId: "session-001",
      chatId: "chat-001",
      userId: "user-001",
      requestedText: "每天 9 点生成日报",
    });

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      result: {
        status: "rejected",
        reason: "workspace_mismatch",
        targetDefinitionId: null,
        summary: "不能跨 workspace 管理定时任务。",
      },
    });
  });

  test("schedule.create 必须校验时间表达并返回一致的 tool result", async () => {
    const harness = createHarness();

    const { body } = await executeTool(harness, {
      toolName: "schedule.create",
      invocation: {
        workspace: harness.agentConfig.workspace,
        actionType: "create",
        label: "日报",
        scheduleExpr: "明天早上 9 点",
        timezone: "Asia/Shanghai",
        promptTemplate: "生成日报",
      },
      workspace: harness.agentConfig.workspace,
      sessionId: "session-001",
      chatId: "chat-001",
      userId: "user-001",
      requestedText: "明天早上 9 点提醒我",
    });

    expect(body.result).toEqual({
      status: "rejected",
      reason: "unsupported_schedule",
      targetDefinitionId: null,
      summary: "不支持该时间表达，请改成当前调度器支持的 cron 形式。",
    });
    expect(await harness.repositories.triggerDefinitions.listDefinitions()).toHaveLength(0);
    expect(await harness.repositories.triggerExecutions.listExecutions()).toHaveLength(0);
    expect(await harness.repositories.scheduleManagementActions.listActions()).toEqual([
      expect.objectContaining({
        actionType: "create",
        resolutionStatus: "rejected",
        reason: "unsupported_schedule",
      }),
    ]);
  });
});
