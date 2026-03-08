import { createExecutorWorker } from "./worker.ts";
import { bootstrapExecutorRuntime, type BootstrapExecutorRuntimeOptions } from "./bootstrap.ts";
import { evaluateExecutorReadiness } from "./services/runtime-readiness.ts";

type RunExecutorOptions = {
  autoStartLoop?: boolean;
  createBridge?: BootstrapExecutorRuntimeOptions["createBridge"];
  createRuntimeServices?: BootstrapExecutorRuntimeOptions["createRuntimeServices"];
  env?: Record<string, string | undefined>;
};

export async function runExecutor(options: RunExecutorOptions = {}) {
  const runtime = await bootstrapExecutorRuntime({
    createBridge: options.createBridge,
    createRuntimeServices: options.createRuntimeServices,
    env: options.env,
  });

  runtime.services.logger.executorState("starting", {
    configFingerprint: runtime.services.configFingerprint,
    postgresReady: false,
    redisReady: false,
    codexReady: false,
    consumerActive: false,
  });

  await runtime.publishFingerprint();
  let startupReport = await evaluateExecutorReadiness(
    {
      bridge: runtime.bridge,
      configFingerprint: runtime.services.configFingerprint,
      driftMessage: await runtime.detectConfigDrift(),
      services: runtime.services,
    },
    "startup",
  );

  runtime.services.logger.executorState(startupReport.status, {
    configFingerprint: startupReport.configFingerprint,
    postgresReady: startupReport.postgresReady,
    redisReady: startupReport.redisReady,
    codexReady: startupReport.codexReady,
    consumerActive: startupReport.consumerActive,
    errorCode: startupReport.errorCode,
    errorMessage: startupReport.errorMessage,
  });

  let timer: Timer | null = null;

  async function tick(): Promise<boolean> {
    if (!startupReport.consumerActive && startupReport.status === "failed") {
      return false;
    }

    const report = await evaluateExecutorReadiness(
      {
        bridge: runtime.bridge,
        configFingerprint: runtime.services.configFingerprint,
        driftMessage: await runtime.detectConfigDrift(),
        services: runtime.services,
      },
      "runtime",
    );

    startupReport = report;
    if (!report.consumerActive) {
      runtime.services.logger.executorState(report.status, {
        configFingerprint: report.configFingerprint,
        postgresReady: report.postgresReady,
        redisReady: report.redisReady,
        codexReady: report.codexReady,
        consumerActive: report.consumerActive,
        errorCode: report.errorCode,
        errorMessage: report.errorMessage,
      });
      return false;
    }

    return runtime.worker.processNext();
  }

  if (options.autoStartLoop ?? true) {
    timer = setInterval(() => {
      void tick();
    }, runtime.services.config.executor.pollIntervalMs);
  }

  return {
    get startupReport() {
      return startupReport;
    },
    loggerEntries() {
      return runtime.services.logger.listEntries();
    },
    stop: async () => {
      if (timer) {
        clearInterval(timer);
      }
      await runtime.stop();
    },
    tick,
  };
}

export async function startExecutor() {
  return runExecutor({
    autoStartLoop: true,
  });
}

export { createExecutorWorker };

if (import.meta.main) {
  await startExecutor();
}
