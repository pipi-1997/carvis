import { describe, expect, test } from "bun:test";

import { createRunToolRouter } from "../../apps/gateway/src/services/run-tool-router.ts";
import { createScheduleManagementService } from "../../apps/gateway/src/services/schedule-management-service.ts";
import { createInMemoryRepositories } from "../../packages/core/src/storage/repositories.ts";

describe("run tool router", () => {
  test("workspace mismatch 时拒绝 schedule tool call", async () => {
    const repositories = createInMemoryRepositories();
    const scheduleManagementService = createScheduleManagementService({
      repositories,
      now: () => new Date("2026-03-10T00:00:00.000Z"),
    });
    const router = createRunToolRouter({
      scheduleManagementService,
      agentId: "codex-main",
    });

    const result = await router.execute({
      toolName: "schedule.create",
      invocation: {
        workspace: "/tmp/other",
        actionType: "create",
        label: "日报",
        scheduleExpr: "0 9 * * *",
        timezone: "Asia/Shanghai",
        promptTemplate: "生成日报",
      },
      workspace: "/tmp/current",
      sessionId: "session-001",
      chatId: "chat-001",
      userId: "user-001",
      requestedText: "每天 9 点生成日报",
    });

    expect(result).toEqual({
      status: "rejected",
      reason: "workspace_mismatch",
      targetDefinitionId: null,
      summary: "不能跨 workspace 管理定时任务。",
    });
  });

  test("invocation 未显式提供 workspace 时回落到当前 workspace", async () => {
    const repositories = createInMemoryRepositories();
    const scheduleManagementService = createScheduleManagementService({
      repositories,
      now: () => new Date("2026-03-10T00:00:00.000Z"),
    });
    const router = createRunToolRouter({
      scheduleManagementService,
      agentId: "codex-main",
    });

    const result = await router.execute({
      toolName: "schedule.create",
      invocation: {
        actionType: "create",
        label: "日报",
        scheduleExpr: "0 9 * * *",
        timezone: "Asia/Shanghai",
        promptTemplate: "生成日报",
      },
      workspace: "/tmp/current",
      sessionId: "session-001",
      chatId: "chat-001",
      userId: "user-001",
      requestedText: "每天 9 点生成日报",
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: "executed",
      }),
    );

    const definitions = await repositories.triggerDefinitions.listDefinitions();
    expect(definitions[0]?.workspace).toBe("/tmp/current");
  });
});
