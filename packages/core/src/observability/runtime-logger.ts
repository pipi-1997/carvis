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

export function createRuntimeLogger(baseLogger = new StructuredLogger()) {
  return {
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
