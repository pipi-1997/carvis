import { StructuredLogger } from "./logger.ts";
import type { RuntimeStatus } from "../domain/runtime-models.ts";

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

export function createRuntimeLogger(baseLogger = new StructuredLogger()) {
  return {
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
