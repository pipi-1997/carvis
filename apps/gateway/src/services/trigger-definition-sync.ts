import { createHash } from "node:crypto";

import type {
  RuntimeConfig,
  TriggerDefinition,
  TriggerDefinitionSourceType,
  TriggerExecutionStatus,
  TriggerConfig,
  RepositoryBundle,
} from "@carvis/core";

import { computeNextScheduledAt } from "./scheduler-loop.ts";

type TriggerDefinitionSyncInput = {
  config: TriggerConfig;
  repositories: RepositoryBundle;
  workspaceResolverConfig: RuntimeConfig["workspaceResolver"];
  now?: () => Date;
};

type TriggerDefinitionSyncResult = {
  createdOrUpdated: string[];
  disabled: string[];
};

export function createTriggerDefinitionSync(input: TriggerDefinitionSyncInput) {
  const now = input.now ?? (() => new Date());

  return {
    async syncDefinitions(): Promise<TriggerDefinitionSyncResult> {
      const timestamp = now();
      const existingDefinitions = await input.repositories.triggerDefinitions.listDefinitions();
      const existingById = new Map(existingDefinitions.map((definition) => [definition.id, definition]));
      const nextConfigDefinitions = buildPersistedDefinitions(input.config, input.workspaceResolverConfig, timestamp);

      const createdOrUpdated: string[] = [];
      for (const definition of nextConfigDefinitions) {
      const existing = existingById.get(definition.id) ?? null;
        await input.repositories.triggerDefinitions.upsertDefinition({
          ...definition,
          definitionOrigin: (existing?.definitionOrigin ?? definition.definitionOrigin ?? "config") as "config" | "agent",
          label: existing?.label ?? definition.label,
          nextDueAt: selectNextDueAt({
            existing,
            nextDueAt: definition.nextDueAt,
            now: timestamp,
          }),
          now: timestamp,
          lastTriggeredAt: existing?.lastTriggeredAt ?? null,
          lastTriggerStatus: existing?.lastTriggerStatus ?? null,
          lastManagedAt: existing?.lastManagedAt ?? timestamp.toISOString(),
          lastManagedBySessionId: existing?.lastManagedBySessionId ?? null,
          lastManagedByChatId: existing?.lastManagedByChatId ?? null,
          lastManagementAction: existing?.definitionOrigin === "agent" ? existing?.lastManagementAction ?? "create" : "config_sync",
        });
        createdOrUpdated.push(definition.id);
      }

      const runtimeDefinitionIds = new Set(nextConfigDefinitions.map((definition) => definition.id));
      const disabled: string[] = [];
      for (const definition of existingDefinitions) {
        if (runtimeDefinitionIds.has(definition.id)) {
          continue;
        }
        if (definition.definitionOrigin === "agent") {
          continue;
        }

        await input.repositories.triggerDefinitions.updateDefinitionRuntimeState({
          definitionId: definition.id,
          enabled: false,
          nextDueAt: null,
          now: timestamp,
        });
        disabled.push(definition.id);
      }

      return {
        createdOrUpdated,
        disabled,
      };
    },
  };
}

function buildPersistedDefinitions(
  config: TriggerConfig,
  workspaceResolverConfig: RuntimeConfig["workspaceResolver"],
  now: Date,
) {
  return [
    ...config.scheduledJobs.map((definition) =>
      createPersistedDefinition({
        agentId: definition.agentId,
        definitionId: definition.id,
        deliveryTarget: definition.delivery,
        enabled: definition.enabled,
        now,
        promptTemplate: definition.promptTemplate,
        scheduleExpr: definition.schedule,
        slug: null,
        sourceType: "scheduled_job",
        timezone: definition.timezone,
        workspace: resolveWorkspacePath(workspaceResolverConfig, definition.workspace),
      })),
    ...config.webhooks.map((definition) =>
      createPersistedDefinition({
        agentId: definition.agentId,
        definitionId: definition.id,
        deliveryTarget: definition.delivery,
        enabled: definition.enabled,
        now,
        optionalFields: definition.optionalFields,
        promptTemplate: definition.promptTemplate,
        replayWindowSeconds: definition.replayWindowSeconds,
        requiredFields: definition.requiredFields,
        secretRef: definition.secretEnv,
        slug: definition.slug,
        sourceType: "external_webhook",
        workspace: resolveWorkspacePath(workspaceResolverConfig, definition.workspace),
      })),
  ].sort((left, right) => left.id.localeCompare(right.id));
}

function createPersistedDefinition(input: {
  agentId: string;
  definitionId: string;
  deliveryTarget: TriggerDefinition["deliveryTarget"];
  enabled: boolean;
  now: Date;
  optionalFields?: string[];
  promptTemplate: string;
  replayWindowSeconds?: number;
  requiredFields?: string[];
  scheduleExpr?: string | null;
  secretRef?: string | null;
  slug: string | null;
  sourceType: TriggerDefinitionSourceType;
  timezone?: string | null;
  workspace: string;
}) {
  const nextDueAt =
    input.sourceType === "scheduled_job" && input.scheduleExpr
      ? computeNextScheduledAt(input.scheduleExpr, input.now, input.timezone ?? null)
      : null;

  return {
    id: input.definitionId,
    sourceType: input.sourceType,
    definitionOrigin: "config",
    slug: input.slug,
    enabled: input.enabled,
    workspace: input.workspace,
    agentId: input.agentId,
    label: input.definitionId,
    promptTemplate: input.promptTemplate,
    deliveryTarget: input.deliveryTarget,
    scheduleExpr: input.scheduleExpr ?? null,
    timezone: input.timezone ?? null,
    nextDueAt,
    lastManagedAt: input.now.toISOString(),
    lastManagedBySessionId: null,
    lastManagedByChatId: null,
    lastManagementAction: "config_sync",
    secretRef: input.secretRef ?? null,
    requiredFields: [...(input.requiredFields ?? [])],
    optionalFields: [...(input.optionalFields ?? [])],
    replayWindowSeconds: input.replayWindowSeconds ?? null,
    definitionHash: buildTriggerDefinitionHash({
      agentId: input.agentId,
      deliveryTarget: input.deliveryTarget,
      enabled: input.enabled,
      optionalFields: input.optionalFields ?? [],
      promptTemplate: input.promptTemplate,
      replayWindowSeconds: input.replayWindowSeconds ?? null,
      requiredFields: input.requiredFields ?? [],
      scheduleExpr: input.scheduleExpr ?? null,
      secretRef: input.secretRef ?? null,
      slug: input.slug,
      sourceType: input.sourceType,
      timezone: input.timezone ?? null,
      workspace: input.workspace,
    }),
  };
}

function buildTriggerDefinitionHash(input: {
  agentId: string;
  deliveryTarget: TriggerDefinition["deliveryTarget"];
  enabled: boolean;
  optionalFields: string[];
  promptTemplate: string;
  replayWindowSeconds: number | null;
  requiredFields: string[];
  scheduleExpr: string | null;
  secretRef: string | null;
  slug: string | null;
  sourceType: TriggerDefinitionSourceType;
  timezone: string | null;
  workspace: string;
}) {
  const payload = {
    agentId: input.agentId,
    deliveryTarget: input.deliveryTarget,
    enabled: input.enabled,
    optionalFields: [...input.optionalFields].sort(),
    promptTemplate: input.promptTemplate,
    replayWindowSeconds: input.replayWindowSeconds,
    requiredFields: [...input.requiredFields].sort(),
    scheduleExpr: input.scheduleExpr,
    secretRef: input.secretRef,
    slug: input.slug,
    sourceType: input.sourceType,
    timezone: input.timezone,
    workspace: input.workspace,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function resolveWorkspacePath(
  workspaceResolverConfig: RuntimeConfig["workspaceResolver"],
  workspaceKey: string,
) {
  const workspacePath = workspaceResolverConfig.registry[workspaceKey];
  if (!workspacePath) {
    throw new Error(`trigger workspace must exist in workspaceResolver.registry: ${workspaceKey}`);
  }
  return workspacePath;
}

function selectNextDueAt(input: {
  existing: TriggerDefinition | null;
  nextDueAt: string | null;
  now: Date;
}) {
  if (!input.existing?.nextDueAt) {
    return input.nextDueAt;
  }

  if (new Date(input.existing.nextDueAt).getTime() <= input.now.getTime()) {
    return input.existing.nextDueAt;
  }

  return input.nextDueAt;
}

export function projectTriggerExecutionStatus(input: {
  definitionEnabled: boolean;
  requestedStatus: TriggerExecutionStatus;
}) {
  if (!input.definitionEnabled && input.requestedStatus === "accepted") {
    return "skipped" satisfies TriggerExecutionStatus;
  }
  return input.requestedStatus;
}

export { buildTriggerDefinitionHash };
