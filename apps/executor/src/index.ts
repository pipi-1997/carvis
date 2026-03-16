import { createLocalRuntimeStateSink } from "@carvis/core";

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
  const stateSink = resolveExecutorStateSink(options.env);
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
      onReport: async (report) => {
        await stateSink?.writeExecutorState({
          startupReport: report,
        });
      },
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
        onReport: async (nextReport) => {
          await stateSink?.writeExecutorState({
            startupReport: nextReport,
          });
        },
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
      await stateSink?.writeStopped({
        configFingerprint: runtime.services.configFingerprint,
      });
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

type InstallSignalHandlersOptions = {
  exit(code: number): void;
  on(signal: "SIGINT" | "SIGTERM", handler: (signal: string) => void): void;
  stderr?(text: string): void;
  stop(): Promise<void>;
};

export function installExecutorSignalHandlers(options: InstallSignalHandlersOptions) {
  let shuttingDown = false;

  const handleSignal = async (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    try {
      await options.stop();
      options.exit(0);
    } catch (error) {
      const stderr = options.stderr ?? ((text: string) => process.stderr.write(text));
      stderr(`failed to stop executor on ${signal}: ${error instanceof Error ? error.message : String(error)}\n`);
      options.exit(1);
    }
  };

  options.on("SIGINT", handleSignal);
  options.on("SIGTERM", handleSignal);
}

function resolveExecutorStateSink(env: Record<string, string | undefined> = process.env) {
  const stateDir = env.CARVIS_STATE_DIR;
  if (!stateDir) {
    return null;
  }

  return createLocalRuntimeStateSink({
    logPath: env.CARVIS_LOG_PATH ?? "",
    pid: process.pid,
    role: "executor",
    startedAt: new Date().toISOString(),
    stateDir,
  });
}

if (import.meta.main) {
  const runtime = await startExecutor();
  installExecutorSignalHandlers({
    exit(code) {
      process.exit(code);
    },
    on(signal, handler) {
      process.on(signal, handler);
    },
    stop() {
      return runtime.stop();
    },
  });
}
