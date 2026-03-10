import { StructuredLogger } from "./logger.ts";
import type { RuntimeStatus } from "../domain/runtime-models.ts";
import type { TriggerDefinitionSourceType, TriggerExecutionStatus, WorkspaceBindingSource } from "../domain/models.ts";

type GatewayStateInput = {
  configFingerprint: string;
  feishuReady: boolean;
  feishuIngressReady: boolean;
  errorCode?: string;
  errorMessage?: string;
};

type ExecutorStateInput = {
  configFingerprint: string;
  postgresReady: boolean;
  redisReady: boolean;
  codexReady: boolean;
  consumerActive: boolean;
  errorCode?: string;
  errorMessage?: string;
};

type ContinuationBindingStateInput = {
  agentId: string;
  chatId: string;
  sessionId: string;
  runId?: string;
  bridgeSessionId?: string | null;
  reason?: string;
  recoveryResult?: string | null;
};

type WorkspaceResolutionStateInput = {
  agentId: string;
  chatId: string;
  sessionId: string;
  workspaceKey?: string | null;
  workspacePath?: string | null;
  trigger: "prompt" | "status";
};

type WorkspaceBindStateInput = {
  agentId: string;
  chatId: string;
  sessionId: string;
  workspaceKey?: string | null;
  workspacePath?: string | null;
  reason?: string;
};

type CommandStateInput = {
  agentId: string;
  chatId: string;
  sessionId: string;
  command?: string | null;
  normalizedText?: string | null;
  rawText?: string | null;
  reason?: string;
};

type TriggerDefinitionSyncStateInput = {
  definitionId: string;
  sourceType: TriggerDefinitionSourceType;
  enabled: boolean;
  nextDueAt?: string | null;
};

type TriggerExecutionStateInput = {
  definitionId: string;
  executionId: string;
  sourceType: TriggerDefinitionSourceType;
  runId?: string | null;
  triggeredAt: string;
  reason?: string | null;
  failureCode?: string | null;
};

type ExternalWebhookStateInput = {
  slug: string;
  definitionId?: string | null;
  reason?: string | null;
};

type PresentationStateInput = {
  runId: string;
  mode?: "streaming" | "terminal";
  outcome?: "preserved" | "normalized" | "degraded" | "fallback_terminal";
  degradedFragments?: string[];
  reason?: string;
  role?: "gateway" | "executor";
};

export function createRuntimeLogger(baseLogger = new StructuredLogger()) {
  return {
    commandState(status: "recognized" | "unknown" | "mention_normalized", input: CommandStateInput) {
      const level = status === "unknown" ? "warn" : "info";
      baseLogger[level](`command.${status}`, {
        role: "gateway",
        status,
        agentId: input.agentId,
        chatId: input.chatId,
        sessionId: input.sessionId,
        ...(input.command ? { command: input.command } : {}),
        ...(input.normalizedText ? { normalizedText: input.normalizedText } : {}),
        ...(input.rawText ? { rawText: input.rawText } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      });
    },
    externalWebhookState(
      status: "accepted" | "auth_failed" | "payload_rejected" | "rejected" | "unknown_slug",
      input: ExternalWebhookStateInput,
    ) {
      const level =
        status === "accepted" ? "info" : status === "unknown_slug" || status === "rejected" ? "warn" : "warn";
      baseLogger[level](`trigger.webhook.${status}`, {
        role: "gateway",
        status,
        slug: input.slug,
        ...(input.definitionId ? { definitionId: input.definitionId } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      });
    },
    presentationState(
      status: "preserved" | "normalized" | "degraded" | "fallback_terminal" | "card_create_failed" | "card_update_failed" | "card_complete_failed",
      input: PresentationStateInput,
    ) {
      const level = status === "degraded" || status.endsWith("_failed") ? "warn" : "info";
      baseLogger[level](`presentation.feishu.${status}`, {
        role: input.role ?? "gateway",
        runId: input.runId,
        ...(input.mode ? { mode: input.mode } : {}),
        ...(input.outcome ? { outcome: input.outcome } : {}),
        ...(input.degradedFragments && input.degradedFragments.length > 0
          ? { degradedFragments: input.degradedFragments }
          : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      });
    },
    continuationBindingState(
      status: "bound" | "reset" | "invalidated" | "recovered" | "recovery_failed",
      input: ContinuationBindingStateInput,
    ) {
      const level = status === "invalidated" || status === "recovery_failed" ? "warn" : "info";
      baseLogger[level](`continuation.binding.${status}`, {
        role: "executor",
        status,
        agentId: input.agentId,
        chatId: input.chatId,
        sessionId: input.sessionId,
        runId: input.runId,
        ...(input.bridgeSessionId ? { bridgeSessionId: input.bridgeSessionId } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.recoveryResult ? { recoveryResult: input.recoveryResult } : {}),
      });
    },
    workspaceBindState(
      status: "bound" | "created" | "noop_already_bound" | "rejected_active_run" | "create_failed",
      input: WorkspaceBindStateInput,
    ) {
      const level = status === "create_failed" ? "error" : status === "rejected_active_run" ? "warn" : "info";
      baseLogger[level](`workspace.bind.${status}`, {
        role: "gateway",
        status,
        agentId: input.agentId,
        chatId: input.chatId,
        sessionId: input.sessionId,
        ...(input.workspaceKey ? { workspaceKey: input.workspaceKey } : {}),
        ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      });
    },
    workspaceResolutionState(status: WorkspaceBindingSource, input: WorkspaceResolutionStateInput) {
      const level = status === "unbound" ? "warn" : "info";
      baseLogger[level](`workspace.resolution.${status}`, {
        role: "gateway",
        status,
        agentId: input.agentId,
        chatId: input.chatId,
        sessionId: input.sessionId,
        trigger: input.trigger,
        ...(input.workspaceKey ? { workspaceKey: input.workspaceKey } : {}),
        ...(input.workspacePath ? { workspacePath: input.workspacePath } : {}),
      });
    },
    error(message: string, context?: Record<string, unknown>) {
      baseLogger.error(message, context);
    },
    executorState(status: RuntimeStatus, input: ExecutorStateInput) {
      const level = status === "failed" ? "error" : status === "degraded" ? "warn" : "info";
      baseLogger[level](`runtime.executor.${status}`, {
        role: "executor",
        status,
        configFingerprint: input.configFingerprint,
        postgresReady: input.postgresReady,
        redisReady: input.redisReady,
        codexReady: input.codexReady,
        consumerActive: input.consumerActive,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      });
    },
    gatewayState(status: RuntimeStatus, input: GatewayStateInput) {
      const level = status === "failed" ? "error" : status === "degraded" ? "warn" : "info";
      baseLogger[level](`runtime.gateway.${status}`, {
        role: "gateway",
        status,
        configFingerprint: input.configFingerprint,
        feishuReady: input.feishuReady,
        feishuIngressReady: input.feishuIngressReady,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      });
    },
    info(message: string, context?: Record<string, unknown>) {
      baseLogger.info(message, context);
    },
    triggerDefinitionSyncState(
      status: "next_due_synced" | "runtime_sync_upserted" | "runtime_sync_disabled",
      input: TriggerDefinitionSyncStateInput,
    ) {
      baseLogger.info(`trigger.definition.${status}`, {
        role: "gateway",
        status,
        definitionId: input.definitionId,
        sourceType: input.sourceType,
        enabled: input.enabled,
        nextDueAt: input.nextDueAt ?? null,
      });
    },
    triggerExecutionState(status: TriggerExecutionStatus, input: TriggerExecutionStateInput) {
      const level = status === "failed" || status === "missed" || status === "rejected" ? "warn" : "info";
      baseLogger[level](`trigger.execution.${status}`, {
        role: "gateway",
        status,
        definitionId: input.definitionId,
        executionId: input.executionId,
        sourceType: input.sourceType,
        triggeredAt: input.triggeredAt,
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
        ...(input.failureCode ? { failureCode: input.failureCode } : {}),
      });
    },
    listEntries() {
      return baseLogger.listEntries();
    },
    warn(message: string, context?: Record<string, unknown>) {
      baseLogger.warn(message, context);
    },
  };
}
