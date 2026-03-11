import { describe, expect, test } from "bun:test";

import { createScheduleManagementService } from "../../apps/gateway/src/services/schedule-management-service.ts";
import { createInMemoryRepositories } from "../../packages/core/src/storage/repositories.ts";

describe("schedule management service", () => {
  test("create 提醒类 schedule 时保留用户定义的 promptTemplate 原文", async () => {
    const repositories = createInMemoryRepositories();
    const service = createScheduleManagementService({
      repositories,
      now: () => new Date("2026-03-10T00:00:00.000Z"),
    });

    const result = await service.create({
      workspace: "/tmp/workspaces/main",
      sessionId: "session-001",
      chatId: "chat-001",
      userId: "user-001",
      requestedText: "明天上午 9 点提醒我：real chat verify",
      agentId: "codex-main",
      invocation: {
        actionType: "create",
        label: "提醒",
        scheduleExpr: "0 9 12 3 *",
        timezone: "Asia/Shanghai",
        promptTemplate: "real chat verify",
        deliveryTarget: {
          kind: "feishu_chat",
          chatId: "chat-001",
        },
      },
    });

    const definition = await repositories.triggerDefinitions.getDefinitionById(result.targetDefinitionId ?? "");
    expect(definition?.promptTemplate).toBe("real chat verify");
  });

  test("create 遇到不支持的时间表达时返回 rejected 且不会写入 definition", async () => {
    const repositories = createInMemoryRepositories();
    const service = createScheduleManagementService({
      repositories,
      now: () => new Date("2026-03-10T00:00:00.000Z"),
    });

    const result = await service.create({
      workspace: "/tmp/workspaces/main",
      sessionId: "session-001",
      chatId: "chat-001",
      userId: "user-001",
      requestedText: "明天早上 9 点提醒我",
      agentId: "codex-main",
      invocation: {
        actionType: "create",
        label: "日报",
        scheduleExpr: "明天早上 9 点",
        timezone: "Asia/Shanghai",
        promptTemplate: "生成日报",
      },
    });

    expect(result).toEqual({
      status: "rejected",
      reason: "unsupported_schedule",
      targetDefinitionId: null,
      summary: "不支持该时间表达，请改成当前调度器支持的 cron 形式。",
    });
    expect(await repositories.triggerDefinitions.listDefinitions()).toHaveLength(0);
    expect(await repositories.scheduleManagementActions.listActions()).toEqual([
      expect.objectContaining({
        actionType: "create",
        resolutionStatus: "rejected",
        reason: "unsupported_schedule",
      }),
    ]);
  });

  test("list 只返回当前 workspace 的 effective schedule，并记录管理动作", async () => {
    const repositories = createInMemoryRepositories();
    const service = createScheduleManagementService({
      repositories,
      now: () => new Date("2026-03-10T00:00:00.000Z"),
    });

    await repositories.triggerDefinitions.upsertDefinition({
      id: "daily-report",
      sourceType: "scheduled_job",
      definitionOrigin: "config",
      slug: null,
      enabled: true,
      workspace: "/tmp/workspaces/main",
      agentId: "codex-main",
      label: "日报",
      promptTemplate: "生成日报",
      deliveryTarget: { kind: "none" },
      scheduleExpr: "0 9 * * *",
      timezone: "Asia/Shanghai",
      nextDueAt: "2026-03-10T01:00:00.000Z",
      lastTriggeredAt: null,
      lastTriggerStatus: null,
      lastManagedAt: null,
      lastManagedBySessionId: null,
      lastManagedByChatId: null,
      lastManagementAction: null,
      secretRef: null,
      requiredFields: [],
      optionalFields: [],
      replayWindowSeconds: null,
      definitionHash: null,
      now: new Date("2026-03-10T00:00:00.000Z"),
    });
    await repositories.triggerDefinitions.upsertDefinition({
      id: "other-workspace",
      sourceType: "scheduled_job",
      definitionOrigin: "agent",
      slug: null,
      enabled: true,
      workspace: "/tmp/workspaces/other",
      agentId: "codex-main",
      label: "其他任务",
      promptTemplate: "其他任务",
      deliveryTarget: { kind: "none" },
      scheduleExpr: "0 10 * * *",
      timezone: "Asia/Shanghai",
      nextDueAt: "2026-03-10T02:00:00.000Z",
      lastTriggeredAt: null,
      lastTriggerStatus: null,
      lastManagedAt: null,
      lastManagedBySessionId: null,
      lastManagedByChatId: null,
      lastManagementAction: null,
      secretRef: null,
      requiredFields: [],
      optionalFields: [],
      replayWindowSeconds: null,
      definitionHash: null,
      now: new Date("2026-03-10T00:00:00.000Z"),
    });

    const result = await service.list({
      workspace: "/tmp/workspaces/main",
      sessionId: "session-001",
      chatId: "chat-001",
      userId: "user-001",
      requestedText: "我现在有哪些定时任务",
    });

    expect(result.status).toBe("executed");
    expect(result.summary).toContain("日报");
    expect(result.summary).not.toContain("其他任务");
    expect(await repositories.scheduleManagementActions.listActions()).toEqual([
      expect.objectContaining({
        actionType: "list",
        resolutionStatus: "executed",
      }),
    ]);
  });

  test("update 命中 config definition 时会写入 override 并更新审计字段", async () => {
    const repositories = createInMemoryRepositories();
    const now = () => new Date("2026-03-10T00:00:00.000Z");
    const service = createScheduleManagementService({
      repositories,
      now,
    });

    await repositories.triggerDefinitions.upsertDefinition({
      id: "daily-report",
      sourceType: "scheduled_job",
      definitionOrigin: "config",
      slug: null,
      enabled: true,
      workspace: "/tmp/workspaces/main",
      agentId: "codex-main",
      label: "日报",
      promptTemplate: "生成日报",
      deliveryTarget: { kind: "none" },
      scheduleExpr: "0 9 * * *",
      timezone: "Asia/Shanghai",
      nextDueAt: "2026-03-10T01:00:00.000Z",
      lastTriggeredAt: null,
      lastTriggerStatus: null,
      lastManagedAt: null,
      lastManagedBySessionId: null,
      lastManagedByChatId: null,
      lastManagementAction: null,
      secretRef: null,
      requiredFields: [],
      optionalFields: [],
      replayWindowSeconds: null,
      definitionHash: null,
      now: now(),
    });

    const result = await service.update({
      workspace: "/tmp/workspaces/main",
      sessionId: "session-001",
      chatId: "chat-001",
      userId: "user-001",
      requestedText: "把日报改成工作日上午 10 点",
      invocation: {
        actionType: "update",
        targetReference: "日报",
        scheduleExpr: "0 10 * * *",
        timezone: "Asia/Shanghai",
        promptTemplate: "生成日报",
      },
    });

    const effective = await repositories.triggerDefinitions.getEffectiveDefinitionById("daily-report");
    const baseline = await repositories.triggerDefinitions.getDefinitionById("daily-report");
    expect(result).toEqual({
      status: "executed",
      reason: null,
      targetDefinitionId: "daily-report",
      summary: "已更新定时任务：日报",
    });
    expect(effective).toEqual(expect.objectContaining({
      scheduleExpr: "0 10 * * *",
      overridden: true,
      definitionOrigin: "config",
      lastManagedBySessionId: "session-001",
      lastManagedByChatId: "chat-001",
    }));
    expect(baseline).toEqual(expect.objectContaining({
      lastManagementAction: "update",
      lastManagedBySessionId: "session-001",
      lastManagedByChatId: "chat-001",
    }));
  });

  test("update 修改 scheduleExpr 后会同步刷新 nextDueAt，避免沿用旧触发时间", async () => {
    const repositories = createInMemoryRepositories();
    const now = () => new Date("2026-03-10T00:00:00.000Z");
    const service = createScheduleManagementService({
      repositories,
      now,
    });

    await repositories.triggerDefinitions.upsertDefinition({
      id: "daily-report",
      sourceType: "scheduled_job",
      definitionOrigin: "config",
      slug: null,
      enabled: true,
      workspace: "/tmp/workspaces/main",
      agentId: "codex-main",
      label: "日报",
      promptTemplate: "生成日报",
      deliveryTarget: { kind: "none" },
      scheduleExpr: "0 9 * * *",
      timezone: "Asia/Shanghai",
      nextDueAt: "2026-03-10T01:00:00.000Z",
      lastTriggeredAt: null,
      lastTriggerStatus: null,
      lastManagedAt: null,
      lastManagedBySessionId: null,
      lastManagedByChatId: null,
      lastManagementAction: null,
      secretRef: null,
      requiredFields: [],
      optionalFields: [],
      replayWindowSeconds: null,
      definitionHash: null,
      now: now(),
    });

    await service.update({
      workspace: "/tmp/workspaces/main",
      sessionId: "session-001",
      chatId: "chat-001",
      userId: "user-001",
      requestedText: "把日报改成工作日上午 10 点",
      invocation: {
        actionType: "update",
        targetReference: "日报",
        scheduleExpr: "0 10 * * *",
        timezone: "Asia/Shanghai",
      },
    });

    const baseline = await repositories.triggerDefinitions.getDefinitionById("daily-report");
    expect(baseline?.nextDueAt).toBe("2026-03-10T02:00:00.000Z");
  });

  test("disable 命中多个目标时返回 needs_clarification 且不会写 override", async () => {
    const repositories = createInMemoryRepositories();
    const now = () => new Date("2026-03-10T00:00:00.000Z");
    const service = createScheduleManagementService({
      repositories,
      now,
    });

    for (const definition of [
      { id: "report-a", label: "日报 A", promptTemplate: "生成日报 A", scheduleExpr: "0 9 * * *" },
      { id: "report-b", label: "日报 B", promptTemplate: "生成日报 B", scheduleExpr: "0 10 * * *" },
    ]) {
      await repositories.triggerDefinitions.upsertDefinition({
        id: definition.id,
        sourceType: "scheduled_job",
        definitionOrigin: "agent",
        slug: null,
        enabled: true,
        workspace: "/tmp/workspaces/main",
        agentId: "codex-main",
        label: definition.label,
        promptTemplate: definition.promptTemplate,
        deliveryTarget: { kind: "none" },
        scheduleExpr: definition.scheduleExpr,
        timezone: "Asia/Shanghai",
        nextDueAt: "2026-03-10T01:00:00.000Z",
        lastTriggeredAt: null,
        lastTriggerStatus: null,
        lastManagedAt: null,
        lastManagedBySessionId: null,
        lastManagedByChatId: null,
        lastManagementAction: null,
        secretRef: null,
        requiredFields: [],
        optionalFields: [],
        replayWindowSeconds: null,
        definitionHash: null,
        now: now(),
      });
    }

    const result = await service.disable({
      workspace: "/tmp/workspaces/main",
      sessionId: "session-001",
      chatId: "chat-001",
      userId: "user-001",
      requestedText: "取消那个日报",
      invocation: {
        actionType: "disable",
        targetReference: "日报",
      },
    });

    expect(result).toEqual({
      status: "needs_clarification",
      reason: "ambiguous_target",
      question: "找到多个可能的定时任务，请明确说明要停用哪一个。",
      targetDefinitionId: null,
      summary: "找到多个可能的定时任务，请明确说明要停用哪一个。",
    });
    expect(await repositories.triggerDefinitionOverrides.listOverrides()).toHaveLength(0);
  });
});
