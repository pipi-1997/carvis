import { randomUUID } from "node:crypto";

import type {
  EffectiveManagedSchedule,
  RepositoryBundle,
  ScheduleToolInvocation,
  ScheduleToolResult,
  TriggerDeliveryTarget,
} from "@carvis/core";

import { computeNextScheduledAt } from "./scheduler-loop.ts";
import { createScheduleDefinitionMatcher } from "./schedule-definition-matcher.ts";

type ScheduleManagementServiceInput = {
  repositories: RepositoryBundle;
  now?: () => Date;
};

export function createScheduleManagementService(input: ScheduleManagementServiceInput) {
  const now = input.now ?? (() => new Date());
  const matcher = createScheduleDefinitionMatcher();

  async function listWorkspaceDefinitions(workspace: string) {
    const definitions = await input.repositories.triggerDefinitions.listEffectiveDefinitions();
    return definitions.filter((definition) => definition.workspace === workspace && definition.sourceType === "scheduled_job");
  }

  async function writeAction(inputAction: {
    sessionId: string;
    chatId: string;
    workspace: string;
    userId: string | null;
    requestedText: string;
    actionType: ScheduleToolInvocation["actionType"];
    resolutionStatus: ScheduleToolResult["status"];
    targetDefinitionId?: string | null;
    reason?: string | null;
    responseSummary?: string | null;
  }) {
    await input.repositories.scheduleManagementActions.createAction({
      sessionId: inputAction.sessionId,
      chatId: inputAction.chatId,
      workspace: inputAction.workspace,
      userId: inputAction.userId,
      requestedText: inputAction.requestedText,
      actionType: inputAction.actionType,
      resolutionStatus: inputAction.resolutionStatus,
      targetDefinitionId: inputAction.targetDefinitionId ?? null,
      reason: inputAction.reason ?? null,
      responseSummary: inputAction.responseSummary ?? null,
      now: now(),
    });
  }

  function validateScheduleExpr(scheduleExpr: string | null | undefined, timezone: string | null | undefined) {
    if (!scheduleExpr) {
      throw new Error("schedule_expr_required");
    }
    computeNextScheduledAt(scheduleExpr, now(), timezone ?? null);
  }

  function buildPromptTemplate(inputPrompt: {
    requestedText: string;
    invocation: ScheduleToolInvocation;
  }) {
    return inputPrompt.invocation.promptTemplate?.trim() || inputPrompt.requestedText.trim();
  }

  async function updateDefinitionAudit(definition: EffectiveManagedSchedule, action: "update" | "disable") {
    const baseline = await input.repositories.triggerDefinitions.getDefinitionById(definition.definitionId);
    if (!baseline) {
      throw new Error(`trigger definition not found: ${definition.definitionId}`);
    }
    await input.repositories.triggerDefinitions.upsertDefinition({
      ...baseline,
      label: baseline.label ?? definition.label,
      definitionOrigin: baseline.definitionOrigin ?? definition.definitionOrigin,
      lastManagedAt: now().toISOString(),
      lastManagedBySessionId: definition.lastManagedBySessionId ?? null,
      lastManagedByChatId: definition.lastManagedByChatId ?? null,
      lastManagementAction: action,
      now: now(),
    });
  }

  return {
    async create(inputAction: {
      workspace: string;
      sessionId: string;
      chatId: string;
      userId: string | null;
      requestedText: string;
      invocation: ScheduleToolInvocation;
      agentId: string;
    }): Promise<ScheduleToolResult> {
      try {
        validateScheduleExpr(inputAction.invocation.scheduleExpr, inputAction.invocation.timezone);
      } catch {
        const result = {
          status: "rejected" as const,
          reason: "unsupported_schedule",
          targetDefinitionId: null,
          summary: "不支持该时间表达，请改成当前调度器支持的 cron 形式。",
        };
        await writeAction({ ...inputAction, actionType: "create", resolutionStatus: result.status, reason: result.reason, responseSummary: result.summary });
        return result;
      }

      const definitionId = randomUUID();
      const label = inputAction.invocation.label?.trim() || inputAction.requestedText.slice(0, 24);
      const nextDueAt = computeNextScheduledAt(
        inputAction.invocation.scheduleExpr!,
        now(),
        inputAction.invocation.timezone ?? null,
      );
      await input.repositories.triggerDefinitions.upsertDefinition({
        id: definitionId,
        sourceType: "scheduled_job",
        definitionOrigin: "agent",
        slug: null,
        enabled: true,
        workspace: inputAction.workspace,
        agentId: inputAction.agentId,
        label,
        promptTemplate: buildPromptTemplate({
          requestedText: inputAction.requestedText,
          invocation: inputAction.invocation,
        }),
        deliveryTarget: normalizeDeliveryTarget(inputAction.invocation.deliveryTarget),
        scheduleExpr: inputAction.invocation.scheduleExpr ?? null,
        timezone: inputAction.invocation.timezone ?? null,
        nextDueAt,
        lastTriggeredAt: null,
        lastTriggerStatus: null,
        lastManagedAt: now().toISOString(),
        lastManagedBySessionId: inputAction.sessionId,
        lastManagedByChatId: inputAction.chatId,
        lastManagementAction: "create",
        secretRef: null,
        requiredFields: [],
        optionalFields: [],
        replayWindowSeconds: null,
        definitionHash: null,
        now: now(),
      });
      const summary = `已创建定时任务：${label}`;
      await writeAction({
        ...inputAction,
        actionType: "create",
        resolutionStatus: "executed",
        targetDefinitionId: definitionId,
        responseSummary: summary,
      });
      return {
        status: "executed",
        reason: null,
        targetDefinitionId: definitionId,
        summary,
      };
    },

    async list(inputAction: {
      workspace: string;
      sessionId: string;
      chatId: string;
      userId: string | null;
      requestedText: string;
    }): Promise<ScheduleToolResult> {
      const definitions = await listWorkspaceDefinitions(inputAction.workspace);
      const summary = definitions.length === 0
        ? "当前 workspace 没有定时任务。"
        : definitions
          .map((definition) => {
            const nextDueAt = definition.nextDueAt ?? "n/a";
            const lastTriggerStatus = definition.lastTriggerStatus ?? "never";
            return [
              definition.label,
              definition.definitionOrigin,
              definition.enabled ? "enabled" : "disabled",
              `next=${nextDueAt}`,
              `last=${lastTriggerStatus}`,
              definition.scheduleExpr ?? "manual",
            ].join(" | ");
          })
          .join("\n");
      await writeAction({
        ...inputAction,
        actionType: "list",
        resolutionStatus: "executed",
        responseSummary: summary,
      });
      return {
        status: "executed",
        reason: null,
        targetDefinitionId: null,
        summary,
      };
    },

    async update(inputAction: {
      workspace: string;
      sessionId: string;
      chatId: string;
      userId: string | null;
      requestedText: string;
      invocation: ScheduleToolInvocation;
    }): Promise<ScheduleToolResult> {
      const definitions = await listWorkspaceDefinitions(inputAction.workspace);
      const match = matcher.match({
        definitions,
        definitionId: inputAction.invocation.definitionId,
        targetReference: inputAction.invocation.targetReference,
      });
      if (match.status === "ambiguous") {
        const summary = "找到多个可能的定时任务，请明确说明要修改哪一个。";
        await writeAction({ ...inputAction, actionType: "update", resolutionStatus: "needs_clarification", reason: "ambiguous_target", responseSummary: summary });
        return { status: "needs_clarification", reason: "ambiguous_target", question: summary, targetDefinitionId: null, summary };
      }
      if (match.status === "not_found") {
        const summary = "没有找到可修改的定时任务。";
        await writeAction({ ...inputAction, actionType: "update", resolutionStatus: "rejected", reason: "target_not_found", responseSummary: summary });
        return { status: "rejected", reason: "target_not_found", targetDefinitionId: null, summary };
      }
      try {
        validateScheduleExpr(inputAction.invocation.scheduleExpr ?? match.definition.scheduleExpr, inputAction.invocation.timezone ?? match.definition.timezone);
      } catch {
        const summary = "不支持该时间表达，请改成当前调度器支持的 cron 形式。";
        await writeAction({ ...inputAction, actionType: "update", resolutionStatus: "rejected", targetDefinitionId: match.definition.definitionId, reason: "unsupported_schedule", responseSummary: summary });
        return { status: "rejected", reason: "unsupported_schedule", targetDefinitionId: match.definition.definitionId, summary };
      }

      await input.repositories.triggerDefinitionOverrides.upsertOverride({
        definitionId: match.definition.definitionId,
        workspace: inputAction.workspace,
        label: inputAction.invocation.label ?? match.definition.label,
        enabled: true,
        scheduleExpr: inputAction.invocation.scheduleExpr ?? match.definition.scheduleExpr,
        timezone: inputAction.invocation.timezone ?? match.definition.timezone,
        promptTemplate: inputAction.invocation.promptTemplate ?? match.definition.promptTemplate,
        deliveryTarget: inputAction.invocation.deliveryTarget ?? match.definition.deliveryTarget,
        managedBySessionId: inputAction.sessionId,
        managedByChatId: inputAction.chatId,
        managedByUserId: inputAction.userId,
        appliedAt: now().toISOString(),
        now: now(),
      });
      const scheduleChanged =
        (inputAction.invocation.scheduleExpr ?? match.definition.scheduleExpr) !== match.definition.scheduleExpr
        || (inputAction.invocation.timezone ?? match.definition.timezone) !== match.definition.timezone;
      if (scheduleChanged) {
        await input.repositories.triggerDefinitions.updateDefinitionRuntimeState({
          definitionId: match.definition.definitionId,
          nextDueAt: computeNextScheduledAt(
            inputAction.invocation.scheduleExpr ?? match.definition.scheduleExpr ?? "",
            now(),
            inputAction.invocation.timezone ?? match.definition.timezone ?? null,
          ),
          now: now(),
        });
      }
      await updateDefinitionAudit({
        ...match.definition,
        lastManagedBySessionId: inputAction.sessionId,
        lastManagedByChatId: inputAction.chatId,
      }, "update");
      const summary = `已更新定时任务：${match.definition.label}`;
      await writeAction({
        ...inputAction,
        actionType: "update",
        resolutionStatus: "executed",
        targetDefinitionId: match.definition.definitionId,
        responseSummary: summary,
      });
      return { status: "executed", reason: null, targetDefinitionId: match.definition.definitionId, summary };
    },

    async disable(inputAction: {
      workspace: string;
      sessionId: string;
      chatId: string;
      userId: string | null;
      requestedText: string;
      invocation: ScheduleToolInvocation;
    }): Promise<ScheduleToolResult> {
      const definitions = await listWorkspaceDefinitions(inputAction.workspace);
      const match = matcher.match({
        definitions,
        definitionId: inputAction.invocation.definitionId,
        targetReference: inputAction.invocation.targetReference,
      });
      if (match.status === "ambiguous") {
        const summary = "找到多个可能的定时任务，请明确说明要停用哪一个。";
        await writeAction({ ...inputAction, actionType: "disable", resolutionStatus: "needs_clarification", reason: "ambiguous_target", responseSummary: summary });
        return { status: "needs_clarification", reason: "ambiguous_target", question: summary, targetDefinitionId: null, summary };
      }
      if (match.status === "not_found") {
        const summary = "没有找到可停用的定时任务。";
        await writeAction({ ...inputAction, actionType: "disable", resolutionStatus: "rejected", reason: "target_not_found", responseSummary: summary });
        return { status: "rejected", reason: "target_not_found", targetDefinitionId: null, summary };
      }

      await input.repositories.triggerDefinitionOverrides.upsertOverride({
        definitionId: match.definition.definitionId,
        workspace: inputAction.workspace,
        label: match.definition.label,
        enabled: false,
        scheduleExpr: match.definition.scheduleExpr,
        timezone: match.definition.timezone,
        promptTemplate: match.definition.promptTemplate,
        deliveryTarget: match.definition.deliveryTarget,
        managedBySessionId: inputAction.sessionId,
        managedByChatId: inputAction.chatId,
        managedByUserId: inputAction.userId,
        appliedAt: now().toISOString(),
        now: now(),
      });
      await updateDefinitionAudit({
        ...match.definition,
        lastManagedBySessionId: inputAction.sessionId,
        lastManagedByChatId: inputAction.chatId,
      }, "disable");
      const summary = `已停用定时任务：${match.definition.label}`;
      await writeAction({
        ...inputAction,
        actionType: "disable",
        resolutionStatus: "executed",
        targetDefinitionId: match.definition.definitionId,
        responseSummary: summary,
      });
      return { status: "executed", reason: null, targetDefinitionId: match.definition.definitionId, summary };
    },
  };
}

function normalizeDeliveryTarget(deliveryTarget: TriggerDeliveryTarget | null | undefined): TriggerDeliveryTarget {
  return deliveryTarget ?? { kind: "none" };
}
