import type { DeliveryStatus, RepositoryBundle, TriggerExecutionStatus } from "@carvis/core";

import { createTriggerInputDigest, type createTriggerDispatcher } from "./trigger-dispatcher.ts";

type SchedulerLoopInput = {
  dispatchWindowMs?: number;
  logger?: ReturnType<typeof import("@carvis/core").createRuntimeLogger>;
  now?: () => Date;
  repositories: RepositoryBundle;
  triggerDispatcher: ReturnType<typeof createTriggerDispatcher>;
};

type SchedulerLoopResult = {
  dispatched: string[];
  missed: string[];
  skipped: string[];
  syncedNextDue: string[];
};

export function createSchedulerLoop(input: SchedulerLoopInput) {
  const now = input.now ?? (() => new Date());
  const dispatchWindowMs = input.dispatchWindowMs ?? 60_000;

  return {
    async runOnce(): Promise<SchedulerLoopResult> {
      const definitions = await input.repositories.triggerDefinitions.listDefinitions();
      const result: SchedulerLoopResult = {
        dispatched: [],
        missed: [],
        skipped: [],
        syncedNextDue: [],
      };

      for (const definition of definitions) {
        if (definition.sourceType !== "scheduled_job" || !definition.scheduleExpr) {
          continue;
        }

        let nextDueAt = definition.nextDueAt;
        if (!nextDueAt) {
          nextDueAt = computeNextScheduledAt(definition.scheduleExpr, now(), definition.timezone);
          await input.repositories.triggerDefinitions.updateDefinitionRuntimeState({
            definitionId: definition.id,
            nextDueAt,
            now: now(),
          });
          input.logger?.triggerDefinitionSyncState?.("next_due_synced", {
            definitionId: definition.id,
            sourceType: definition.sourceType,
            enabled: definition.enabled,
            nextDueAt,
          });
          result.syncedNextDue.push(definition.id);
          continue;
        }

        let cursor = nextDueAt;
        while (cursor && new Date(cursor).getTime() <= now().getTime()) {
          const followingDue = computeNextScheduledAt(definition.scheduleExpr, new Date(cursor), definition.timezone);
          if (!definition.enabled) {
            await input.triggerDispatcher.recordExecution({
              definition,
              nextDueAt: followingDue,
              status: "skipped",
              triggeredAt: cursor,
            });
            result.skipped.push(definition.id);
            cursor = followingDue;
            continue;
          }

          const latenessMs = now().getTime() - new Date(cursor).getTime();
          if (latenessMs > dispatchWindowMs) {
            await input.triggerDispatcher.recordExecution({
              definition,
              nextDueAt: followingDue,
              status: "missed",
              triggeredAt: cursor,
            });
            result.missed.push(definition.id);
            cursor = followingDue;
            continue;
          }

          await input.triggerDispatcher.dispatchDefinition({
            definition,
            inputDigest: createTriggerInputDigest({
              definitionId: definition.id,
              scheduledAt: cursor,
              sourceType: definition.sourceType,
            }),
            nextDueAt: followingDue,
            prompt: definition.promptTemplate,
            triggeredAt: cursor,
          });
          result.dispatched.push(definition.id);
          break;
        }
      }

      return result;
    },
  };
}

export function computeNextScheduledAt(scheduleExpr: string, now: Date, timezone: string | null) {
  const [minuteExpr, hourExpr, dayExpr, monthExpr, weekdayExpr] = scheduleExpr.trim().split(/\s+/);
  if (!minuteExpr || !hourExpr || !dayExpr || !monthExpr || !weekdayExpr) {
    throw new Error(`invalid cron expression: ${scheduleExpr}`);
  }

  for (let offset = 1; offset <= 366 * 24 * 60; offset += 1) {
    const candidate = new Date(now.getTime() + (offset * 60_000));
    const parts = getCronCandidateParts(candidate, timezone);
    if (
      matchesCronField(parts.minute, minuteExpr) &&
      matchesCronField(parts.hour, hourExpr) &&
      matchesCronField(parts.day, dayExpr) &&
      matchesCronField(parts.month, monthExpr) &&
      matchesCronField(parts.weekday, weekdayExpr)
    ) {
      candidate.setUTCSeconds(0, 0);
      return candidate.toISOString();
    }
  }

  throw new Error(`unable to compute next due time for schedule: ${scheduleExpr}`);
}

function getCronCandidateParts(candidate: Date, timezone: string | null) {
  if (!timezone) {
    return {
      minute: candidate.getUTCMinutes(),
      hour: candidate.getUTCHours(),
      day: candidate.getUTCDate(),
      month: candidate.getUTCMonth() + 1,
      weekday: candidate.getUTCDay(),
    };
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(candidate);
  const getNumberPart = (type: "month" | "day" | "hour" | "minute") => {
    const value = parts.find((part) => part.type === type)?.value;
    return Number(value);
  };

  return {
    minute: getNumberPart("minute"),
    hour: getNumberPart("hour"),
    day: getNumberPart("day"),
    month: getNumberPart("month"),
    weekday: mapWeekday(parts.find((part) => part.type === "weekday")?.value),
  };
}

function mapWeekday(weekday: string | undefined) {
  switch (weekday) {
    case "Sun":
      return 0;
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    default:
      throw new Error(`unsupported weekday part: ${weekday ?? "unknown"}`);
  }
}

function matchesCronField(value: number, expr: string) {
  if (expr === "*") {
    return true;
  }

  return expr.split(",").some((segment) => {
    const normalized = segment.trim();
    if (!normalized) {
      return false;
    }
    if (normalized.includes("/")) {
      const [base, stepExpr] = normalized.split("/");
      const step = Number(stepExpr);
      if (!Number.isInteger(step) || step <= 0) {
        return false;
      }
      if (base === "*") {
        return value % step === 0;
      }
      const range = parseRange(base);
      return range !== null && value >= range.start && value <= range.end && (value - range.start) % step === 0;
    }
    const range = parseRange(normalized);
    if (range) {
      return value >= range.start && value <= range.end;
    }
    return Number(normalized) === value;
  });
}

function parseRange(expr: string) {
  if (!expr.includes("-")) {
    return null;
  }
  const [startExpr, endExpr] = expr.split("-");
  const start = Number(startExpr);
  const end = Number(endExpr);
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return null;
  }
  return { end, start };
}

export function deriveVisibleTriggerStatus(input: {
  deliveryStatus: DeliveryStatus | null;
  executionStatus: TriggerExecutionStatus;
  failureCode?: string | null;
}) {
  if (input.failureCode === "heartbeat_expired") {
    return "heartbeat_expired";
  }
  if (input.deliveryStatus === "failed") {
    return "delivery_failed";
  }
  return input.executionStatus;
}
