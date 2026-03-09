import { StructuredLogger } from "./logger.ts";
import type { RuntimeStatus } from "../domain/runtime-models.ts";
import type { WorkspaceBindingSource } from "../domain/models.ts";

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
    listEntries() {
      return baseLogger.listEntries();
    },
    warn(message: string, context?: Record<string, unknown>) {
      baseLogger.warn(message, context);
    },
  };
}
