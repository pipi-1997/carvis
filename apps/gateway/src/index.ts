import { resolveScheduleManagementSocketPath } from "@carvis/core";

import { createGatewayApp } from "./app.ts";
import { bootstrapGatewayRuntime, type BootstrapGatewayRuntimeOptions } from "./bootstrap.ts";
import { startScheduleManagementIpcServer } from "./services/schedule-management-ipc-server.ts";
import { ensureScheduleManagementIpcIgnored } from "./services/schedule-management-ipc-runtime.ts";

type StartGatewayOptions = {
  createFeishuIngress?: BootstrapGatewayRuntimeOptions["createFeishuIngress"];
  createRunReaper?: BootstrapGatewayRuntimeOptions["createRunReaper"];
  createRuntimeServices?: BootstrapGatewayRuntimeOptions["createRuntimeServices"];
  createScheduleManagementIpcServer?: typeof startScheduleManagementIpcServer;
  clearIntervalFn?: (timer: Timer) => void;
  env?: Record<string, string | undefined>;
  reaperIntervalMs?: number;
  schedulerIntervalMs?: number;
  serve?: (options: {
    fetch: (request: Request) => Response | Promise<Response>;
    port: number;
  }) => {
    port: number;
    stop?: () => void | Promise<void>;
  };
  setIntervalFn?: (callback: () => void | Promise<void>, ms: number) => Timer;
  transportFactory?: BootstrapGatewayRuntimeOptions["transportFactory"];
};

export async function startGateway(options: StartGatewayOptions = {}) {
  const runtime = await bootstrapGatewayRuntime({
    createFeishuIngress: options.createFeishuIngress,
    createRunReaper: options.createRunReaper,
    createRuntimeServices: options.createRuntimeServices,
    env: options.env,
    transportFactory: options.transportFactory,
  });

  runtime.services.logger.gatewayState("starting", {
    configFingerprint: runtime.services.configFingerprint,
    feishuReady: false,
    feishuIngressReady: false,
  });

  await runtime.ingress.start();
  await runtime.publishFingerprint();

  const ipcServerFactory = options.createScheduleManagementIpcServer ?? startScheduleManagementIpcServer;
  const ipcServers = new Map<string, Awaited<ReturnType<typeof ipcServerFactory>>>();
  async function reconcileIpcWorkers() {
    const dynamicWorkspacePaths = (await runtime.services.repositories.workspaceCatalog.listEntries()).map((entry) => entry.workspacePath);
    const targetWorkspacePaths = [
      ...new Set([
        ...Object.values(runtime.services.config.workspaceResolver.registry),
        ...dynamicWorkspacePaths,
      ]),
    ];

    for (const workspacePath of targetWorkspacePaths) {
      if (ipcServers.has(workspacePath)) {
        continue;
      }
      await ensureScheduleManagementIpcIgnored(workspacePath);
      const server = await ipcServerFactory({
        app: runtime.app,
        socketPath: resolveScheduleManagementSocketPath({
          ...options.env,
          CARVIS_WORKSPACE: workspacePath,
        }),
      });
      ipcServers.set(workspacePath, server);
    }
  }
  await reconcileIpcWorkers();

  const serveImpl = options.serve ?? ((input) => Bun.serve(input));
  const server = serveImpl({
    fetch: runtime.app.fetch,
    port: runtime.services.config.gateway.port,
  });
  runtime.health.markHttpListening();
  const setIntervalImpl = options.setIntervalFn ?? ((callback, ms) => setInterval(() => void callback(), ms));
  const clearIntervalImpl = options.clearIntervalFn ?? clearInterval;
  const reaperTimer = setIntervalImpl(
    () => runtime.reaper.reapExpiredRuns(),
    options.reaperIntervalMs ?? 1_000,
  );
  const schedulerTimer = setIntervalImpl(
    async () => {
      await reconcileIpcWorkers();
      await runtime.scheduler.runOnce();
    },
    options.schedulerIntervalMs ?? 1_000,
  );

  runtime.services.logger.gatewayState(runtime.health.status(), {
    configFingerprint: runtime.services.configFingerprint,
    feishuReady: runtime.health.state.feishuReady,
    feishuIngressReady: runtime.health.state.feishuIngressReady,
    errorCode: runtime.health.state.lastError?.code,
    errorMessage: runtime.health.state.lastError?.message,
  });

  return {
    app: runtime.app,
    health: runtime.health,
    ingress: runtime.ingress,
    server,
    loggerEntries() {
      return runtime.services.logger.listEntries();
    },
    async stop() {
      clearIntervalImpl(reaperTimer);
      clearIntervalImpl(schedulerTimer);
      for (const ipcServer of ipcServers.values()) {
        await ipcServer.stop();
      }
      await runtime.stop();
      await server.stop?.();
    },
  };
}

export { createGatewayApp };

if (import.meta.main) {
  await startGateway();
}
