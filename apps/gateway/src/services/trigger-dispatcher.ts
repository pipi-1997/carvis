import { createHash } from "node:crypto";

import type {
  AgentConfig,
  QueueDriver,
  RepositoryBundle,
  RuntimeConfig,
  RunEvent,
  TriggerDefinition,
  TriggerExecutionStatus,
} from "@carvis/core";

import { createSandboxModeResolver } from "./sandbox-mode-resolver.ts";
import { resolveTriggerDeliveryTarget } from "./trigger-delivery-resolver.ts";

type TriggerDispatcherInput = {
  agentConfig: AgentConfig;
  logger?: ReturnType<typeof import("@carvis/core").createRuntimeLogger>;
  notifier: {
    notifyRunEvent(session: { chatId: string } | null, event: RunEvent): Promise<void>;
  };
  queue: QueueDriver;
  repositories: RepositoryBundle;
  workspaceResolverConfig: RuntimeConfig["workspaceResolver"];
  now?: () => Date;
};

export function createTriggerDispatcher(input: TriggerDispatcherInput) {
  const now = input.now ?? (() => new Date());
  const sandboxModeResolver = createSandboxModeResolver({
    defaultWorkspaceKey: input.agentConfig.defaultWorkspace,
    repositories: input.repositories,
    workspaceResolverConfig: input.workspaceResolverConfig,
  });

  async function dispatchDefinition(args: {
    definition: TriggerDefinition;
    inputDigest: string;
    nextDueAt?: string | null;
    prompt: string;
    triggeredAt?: string;
  }) {
      const triggeredAt = args.triggeredAt ?? now().toISOString();
      const execution = await input.repositories.triggerExecutions.createExecution({
        definitionId: args.definition.id,
        sourceType: args.definition.sourceType,
        status: "accepted",
        triggeredAt,
        inputDigest: args.inputDigest,
        now: now(),
      });
      input.logger?.triggerExecutionState?.("accepted", {
        definitionId: args.definition.id,
        executionId: execution.id,
        sourceType: args.definition.sourceType,
        triggeredAt,
      });

      const activeRun = await input.repositories.runs.findActiveRunByWorkspace(args.definition.workspace);
      const resolvedSandboxMode = sandboxModeResolver.resolveWorkspaceDefault({
        workspacePath: args.definition.workspace,
      });
      const run = await input.repositories.runs.createQueuedRun({
        sessionId: null,
        agentId: args.definition.agentId || input.agentConfig.id,
        workspace: args.definition.workspace,
        prompt: args.prompt,
        triggerSource: args.definition.sourceType,
        triggerExecutionId: execution.id,
        triggerMessageId: null,
        triggerUserId: null,
        timeoutSeconds: input.agentConfig.timeoutSeconds,
        requestedSandboxMode: resolvedSandboxMode.requestedSandboxMode,
        resolvedSandboxMode: resolvedSandboxMode.resolvedSandboxMode,
        sandboxModeSource: resolvedSandboxMode.sandboxModeSource,
        requestedSessionMode: "fresh",
        requestedBridgeSessionId: null,
        deliveryTarget: resolveTriggerDeliveryTarget(args.definition),
        now: now(),
      });
      const queuePosition = (await input.queue.enqueue(args.definition.workspace, run.id)) + (activeRun ? 1 : 0);
      await input.repositories.runs.updateQueuePosition(run.id, queuePosition);
      const queuedExecution = await input.repositories.triggerExecutions.updateExecution({
        executionId: execution.id,
        status: "queued",
        runId: run.id,
        now: now(),
      });
      await input.repositories.triggerDefinitions.updateDefinitionRuntimeState({
        definitionId: args.definition.id,
        lastTriggeredAt: triggeredAt,
        lastTriggerStatus: "queued",
        nextDueAt: args.nextDueAt,
        now: now(),
      });
      input.logger?.triggerExecutionState?.("queued", {
        definitionId: args.definition.id,
        executionId: queuedExecution.id,
        runId: run.id,
        sourceType: args.definition.sourceType,
        triggeredAt,
      });

      const queuedEvent = await input.repositories.events.appendEvent({
        runId: run.id,
        eventType: "run.queued",
        payload: {
          run_id: run.id,
          workspace: run.workspace,
          queue_position: queuePosition,
        },
        now: now(),
      });
      await input.notifier.notifyRunEvent(null, queuedEvent);

      return {
        execution: queuedExecution,
        queuePosition,
        run,
      };
  }

  async function recordExecution(args: {
    definition: TriggerDefinition;
    failureCode?: string;
    failureMessage?: string;
    inputDigest?: string | null;
    nextDueAt?: string | null;
    rejectionReason?: string | null;
    status: Extract<TriggerExecutionStatus, "missed" | "rejected" | "skipped">;
    triggeredAt?: string;
  }) {
      const triggeredAt = args.triggeredAt ?? now().toISOString();
      const execution = await input.repositories.triggerExecutions.createExecution({
        definitionId: args.definition.id,
        sourceType: args.definition.sourceType,
        status: args.status,
        triggeredAt,
        inputDigest: args.inputDigest ?? null,
        rejectionReason: args.rejectionReason ?? null,
        failureCode: args.failureCode ?? null,
        failureMessage: args.failureMessage ?? null,
        finishedAt: triggeredAt,
        now: now(),
      });
      await input.repositories.triggerDefinitions.updateDefinitionRuntimeState({
        definitionId: args.definition.id,
        lastTriggeredAt: triggeredAt,
        lastTriggerStatus: args.status,
        nextDueAt: args.nextDueAt,
        now: now(),
      });
      input.logger?.triggerExecutionState?.(args.status, {
        definitionId: args.definition.id,
        executionId: execution.id,
        sourceType: args.definition.sourceType,
        triggeredAt,
        reason: args.rejectionReason ?? args.failureMessage ?? null,
        failureCode: args.failureCode ?? null,
      });
      return execution;
  }

  return {
    dispatchDefinition,
    async dispatchExternalWebhook(args: {
      definition: TriggerDefinition;
      inputDigest: string;
      prompt: string;
      triggeredAt?: string;
    }) {
      return dispatchDefinition(args);
    },
    async dispatchScheduledDefinition(args: {
      definition: TriggerDefinition;
      inputDigest: string;
      nextDueAt?: string | null;
      prompt?: string;
      triggeredAt?: string;
    }) {
      return dispatchDefinition({
        ...args,
        prompt: args.prompt ?? args.definition.promptTemplate,
      });
    },
    recordExecution,
    async recordRejectedExecution(args: {
      definition: TriggerDefinition;
      reason: string;
      triggeredAt?: string;
    }) {
      return recordExecution({
        definition: args.definition,
        rejectionReason: args.reason,
        status: "rejected",
        triggeredAt: args.triggeredAt,
      });
    },
  };
}

export function createTriggerInputDigest(input: unknown) {
  return `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
}

export const createInputDigest = createTriggerInputDigest;
