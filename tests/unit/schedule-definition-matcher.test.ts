import { describe, expect, test } from "bun:test";

import type { EffectiveManagedSchedule } from "@carvis/core";

import { createScheduleDefinitionMatcher } from "../../apps/gateway/src/services/schedule-definition-matcher.ts";

function createDefinition(overrides: Partial<EffectiveManagedSchedule> = {}): EffectiveManagedSchedule {
  return {
    id: overrides.id ?? "daily-report",
    definitionId: overrides.definitionId ?? overrides.id ?? "daily-report",
    sourceType: overrides.sourceType ?? "scheduled_job",
    definitionOrigin: overrides.definitionOrigin ?? "config",
    slug: overrides.slug ?? null,
    workspace: overrides.workspace ?? "/tmp/workspaces/main",
    agentId: overrides.agentId ?? "codex-main",
    label: overrides.label ?? "日报",
    enabled: overrides.enabled ?? true,
    promptTemplate: overrides.promptTemplate ?? "生成日报",
    deliveryTarget: overrides.deliveryTarget ?? { kind: "none" },
    scheduleExpr: overrides.scheduleExpr ?? "0 9 * * *",
    timezone: overrides.timezone ?? "Asia/Shanghai",
    nextDueAt: overrides.nextDueAt ?? "2026-03-10T01:00:00.000Z",
    lastTriggeredAt: overrides.lastTriggeredAt ?? null,
    lastTriggerStatus: overrides.lastTriggerStatus ?? null,
    lastManagedAt: overrides.lastManagedAt ?? null,
    lastManagedBySessionId: overrides.lastManagedBySessionId ?? null,
    lastManagedByChatId: overrides.lastManagedByChatId ?? null,
    lastManagementAction: overrides.lastManagementAction ?? null,
    secretRef: overrides.secretRef ?? null,
    requiredFields: overrides.requiredFields ?? [],
    optionalFields: overrides.optionalFields ?? [],
    replayWindowSeconds: overrides.replayWindowSeconds ?? null,
    overridden: overrides.overridden ?? false,
    createdAt: overrides.createdAt ?? "2026-03-10T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-03-10T00:00:00.000Z",
  };
}

describe("schedule definition matcher", () => {
  test("definitionId 命中时直接返回唯一结果", () => {
    const matcher = createScheduleDefinitionMatcher();
    const matched = createDefinition({
      id: "daily-report",
      label: "日报",
    });

    const result = matcher.match({
      definitions: [matched, createDefinition({ id: "weekly-report", label: "周报" })],
      definitionId: "daily-report",
    });

    expect(result).toEqual({
      status: "matched",
      definition: matched,
    });
  });

  test("targetReference 可按 label、prompt 或 scheduleExpr 唯一匹配", () => {
    const matcher = createScheduleDefinitionMatcher();
    const promptMatched = createDefinition({
      id: "build-scan",
      label: "构建巡检",
      promptTemplate: "检查构建失败并总结",
      scheduleExpr: "*/30 * * * *",
    });

    expect(matcher.match({
      definitions: [promptMatched],
      targetReference: "构建失败",
    })).toEqual({
      status: "matched",
      definition: promptMatched,
    });

    expect(matcher.match({
      definitions: [promptMatched],
      targetReference: "*/30",
    })).toEqual({
      status: "matched",
      definition: promptMatched,
    });
  });

  test("targetReference 命中多个 definition 时返回 ambiguous，否则 not_found", () => {
    const matcher = createScheduleDefinitionMatcher();

    expect(matcher.match({
      definitions: [
        createDefinition({ id: "report-a", label: "日报 A", promptTemplate: "生成日报 A" }),
        createDefinition({ id: "report-b", label: "日报 B", promptTemplate: "生成日报 B" }),
      ],
      targetReference: "日报",
    })).toEqual({
      status: "ambiguous",
      definitions: [
        { definitionId: "report-a", label: "日报 A" },
        { definitionId: "report-b", label: "日报 B" },
      ],
    });

    expect(matcher.match({
      definitions: [createDefinition()],
      targetReference: "不存在的任务",
    })).toEqual({
      status: "not_found",
    });
  });
});
