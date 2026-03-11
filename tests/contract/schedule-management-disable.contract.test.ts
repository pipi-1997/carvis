import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("schedule management disable contract", () => {
  test("schedule.disable 命中唯一目标时必须写入 disabled override", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-disable-contract/main";
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-disable-contract",
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
    });

    await harness.syncTriggerDefinitions();

    const response = await harness.gateway.request("http://localhost/internal/run-tools/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        toolName: "schedule.disable",
        invocation: {
          workspace,
          actionType: "disable",
          targetReference: "daily-report",
        },
        workspace,
        sessionId: "session-001",
        chatId: "chat-001",
        userId: "user-001",
        requestedText: "取消每天巡检",
      }),
    });
    const body = await response.json() as { result: Record<string, unknown> };

    expect(body.result).toEqual({
      status: "executed",
      reason: null,
      targetDefinitionId: "daily-report",
      summary: "已停用定时任务：daily-report",
    });
    expect(await harness.repositories.triggerDefinitionOverrides.listOverrides()).toEqual([
      expect.objectContaining({
        definitionId: "daily-report",
        enabled: false,
      }),
    ]);
  });

  test("schedule.disable 命中多个目标时必须返回 needs_clarification", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-disable-contract-ambiguous/main";
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-disable-contract-ambiguous",
      },
      triggerConfig: {
        scheduledJobs: [
          {
            id: "report-a",
            enabled: true,
            workspace: "main",
            agentId: "codex-main",
            schedule: "0 9 * * *",
            timezone: null,
            promptTemplate: "生成日报 A",
            delivery: { kind: "none" },
          },
          {
            id: "report-b",
            enabled: true,
            workspace: "main",
            agentId: "codex-main",
            schedule: "0 10 * * *",
            timezone: null,
            promptTemplate: "生成日报 B",
            delivery: { kind: "none" },
          },
        ],
      },
    });

    await harness.syncTriggerDefinitions();

    const response = await harness.gateway.request("http://localhost/internal/run-tools/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        toolName: "schedule.disable",
        invocation: {
          workspace,
          actionType: "disable",
          targetReference: "日报",
        },
        workspace,
        sessionId: "session-001",
        chatId: "chat-001",
        userId: "user-001",
        requestedText: "取消那个日报",
      }),
    });
    const body = await response.json() as { result: Record<string, unknown> };

    expect(body.result).toEqual({
      status: "needs_clarification",
      reason: "ambiguous_target",
      question: "找到多个可能的定时任务，请明确说明要停用哪一个。",
      targetDefinitionId: null,
      summary: "找到多个可能的定时任务，请明确说明要停用哪一个。",
    });
    expect(await harness.repositories.triggerDefinitionOverrides.listOverrides()).toHaveLength(0);
  });
});
