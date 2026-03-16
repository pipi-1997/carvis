import type { ExecutorStartupReport, RuntimeStatus } from "@carvis/core";
import type { CodexBridge } from "@carvis/bridge-codex";

type ExecutorReadinessOptions = {
  bridge: Pick<CodexBridge, "healthcheck">;
  configFingerprint: string;
  driftMessage?: string | null;
  onReport?: (report: ExecutorStartupReport) => void | Promise<void>;
  services: {
    postgres: {
      ping(): Promise<boolean>;
    };
    redis: {
      ping(): Promise<boolean>;
    };
  };
};

export async function evaluateExecutorReadiness(
  options: ExecutorReadinessOptions,
  mode: "startup" | "runtime",
): Promise<ExecutorStartupReport> {
  const postgresState = await probeDependency(
    async () => options.services.postgres.ping(),
    "POSTGRES_UNAVAILABLE",
    "postgres ping returned false",
  );
  const redisState = await probeDependency(
    async () => options.services.redis.ping(),
    "REDIS_UNAVAILABLE",
    "redis ping returned false",
  );
  const codexState = await probeDependency(
    async () => {
      const result = await options.bridge.healthcheck();
      return result.ok;
    },
    "CODEX_UNAVAILABLE",
    "codex bridge healthcheck returned false",
  );

  let errorCode: string | undefined;
  let errorMessage: string | undefined;

  if (options.driftMessage) {
    errorCode = "CONFIG_DRIFT";
    errorMessage = options.driftMessage;
  } else if (!postgresState.ready) {
    errorCode = postgresState.errorCode;
    errorMessage = postgresState.errorMessage;
  } else if (!redisState.ready) {
    errorCode = redisState.errorCode;
    errorMessage = redisState.errorMessage;
  } else if (!codexState.ready) {
    errorCode = codexState.errorCode;
    errorMessage = codexState.errorMessage;
  }

  const consumerActive = !errorCode;
  const status = resolveRuntimeStatus({
    consumerActive,
    errorCode,
    mode,
  });

  const report: ExecutorStartupReport = {
    role: "executor",
    status,
    configFingerprint: options.configFingerprint,
    postgresReady: postgresState.ready,
    redisReady: redisState.ready,
    codexReady: codexState.ready,
    consumerActive,
    errorCode,
    errorMessage,
  };

  await options.onReport?.(report);

  return report;
}

function resolveRuntimeStatus(input: {
  consumerActive: boolean;
  errorCode?: string;
  mode: "startup" | "runtime";
}): RuntimeStatus {
  if (!input.errorCode) {
    return "ready";
  }

  return input.mode === "runtime" ? "degraded" : "failed";
}

async function probeDependency(
  probe: () => Promise<boolean>,
  errorCode: string,
  falseMessage: string,
): Promise<{ errorCode?: string; errorMessage?: string; ready: boolean }> {
  try {
    const ok = await probe();
    if (!ok) {
      return {
        ready: false,
        errorCode,
        errorMessage: falseMessage,
      };
    }

    return {
      ready: true,
    };
  } catch (error) {
    return {
      ready: false,
      errorCode,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
