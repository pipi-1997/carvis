import { mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";

import { createStatusService, resolveCarvisRuntimeFileSet } from "../../../packages/carvis-cli/src/index.ts";

import { createManagedInfraManager } from "./infra-manager.ts";
import { createManagedProcessSupervisor } from "./process-supervisor.ts";
import { reconcileManagedRuntime } from "./reconcile.ts";

export function createDaemonSupervisor(options: {
  env?: Record<string, string | undefined>;
  infraManager?: ReturnType<typeof createManagedInfraManager>;
  processSupervisor?: ReturnType<typeof createManagedProcessSupervisor>;
  socketPath: string;
  statusService?: {
    getStatus(): Promise<any>;
  };
}) {
  const fileSet = resolveCarvisRuntimeFileSet({
    homeDir: options.env?.HOME,
  });
  const infraManager = options.infraManager ?? createManagedInfraManager({
    env: options.env,
  });
  const processSupervisor = options.processSupervisor ?? createManagedProcessSupervisor({
    env: options.env,
  });
  const statusService = options.statusService ?? createStatusService({
    env: options.env,
  });

  async function writeDaemonState(input: {
    serviceState: string;
    summary: string;
  }) {
    await mkdir(fileSet.stateDir, { recursive: true });
    await writeFile(`${fileSet.stateDir}/daemon.json`, `${JSON.stringify({
      pid: process.pid,
      serviceState: input.serviceState,
      socketPath: options.socketPath,
      summary: input.summary,
    }, null, 2)}\n`);
  }

  async function refreshLayeredStatus() {
    const status = await statusService.getStatus();
    await writeFile(`${fileSet.stateDir}/layered-status.json`, `${JSON.stringify(status, null, 2)}\n`);
    return status;
  }

  async function handleAction(action: string) {
    switch (action) {
      case "daemon_status": {
        const status = await refreshLayeredStatus();
        return {
          daemon: status.daemon,
          status: status.daemon.status,
          summary: status.daemon.summary,
        };
      }
      case "infra_status": {
        await infraManager.probe().catch(() => null);
        const status = await refreshLayeredStatus();
        return {
          infra: status.infra.components,
          status: status.infra.status,
          summary: status.infra.summary,
        };
      }
      case "infra_stop": {
        await infraManager.stop();
        await processSupervisor.stop().catch(() => null);
        const status = await refreshLayeredStatus();
        return {
          infra: status.infra.components,
          status: status.infra.status,
          summary: "infra stopped",
        };
      }
      case "infra_start":
      case "infra_restart":
      case "infra_rebuild": {
        if (action === "infra_restart" || action === "infra_rebuild") {
          await processSupervisor.stop().catch(() => null);
        }
        await (
          action === "infra_restart"
            ? infraManager.restart()
            : action === "infra_rebuild"
              ? infraManager.rebuild()
              : infraManager.start()
        );
        const status = await refreshLayeredStatus();
        return {
          infra: status.infra.components,
          status: status.infra.status,
          summary: status.infra.summary,
        };
      }
      case "runtime_reconcile": {
        const status = await reconcileManagedRuntime({
          env: options.env,
          infraOperation: "start",
          infraManager,
          processSupervisor,
        });
        await writeFile(`${fileSet.stateDir}/layered-status.json`, `${JSON.stringify(status, null, 2)}\n`);
        return action === "runtime_reconcile"
          ? {
              daemon: status.daemon,
              status: status.overallStatus,
              summary: status.runtime.summary,
            }
          : {
              infra: status.infra.components,
              status: status.infra.status,
              summary: status.infra.summary,
            };
      }
      case "daemon_stop": {
        await processSupervisor.stop().catch(() => null);
        await writeDaemonState({
          serviceState: "stopped",
          summary: "daemon stopped",
        });
        return {
          daemon: {
            pid: process.pid,
            serviceState: "stopped",
            socketPath: options.socketPath,
            socketReachable: false,
            status: "stopped",
            summary: "daemon stopped",
          },
          status: "stopped",
          summary: "daemon stopped",
          shouldExit: true,
        };
      }
      default:
        return {
          reason: "unknown_action",
          status: "failed",
          summary: `unknown action: ${action}`,
        };
    }
  }

  return {
    async start() {
      await mkdir(fileSet.stateDir, { recursive: true });
      await rm(options.socketPath, { force: true }).catch(() => {});
      await writeDaemonState({
        serviceState: "starting",
        summary: "daemon starting",
      });

      const server = net.createServer((socket) => {
        let buffer = "";
        socket.on("data", async (chunk) => {
          buffer += chunk.toString("utf8");
          const newlineIndex = buffer.indexOf("\n");
          if (newlineIndex < 0) {
            return;
          }
          const raw = buffer.slice(0, newlineIndex);
          buffer = "";
          const request = JSON.parse(raw) as { action?: string };
          const response = await handleAction(request.action ?? "");
          socket.write(`${JSON.stringify(response)}\n`);
          socket.end();
          if ((response as { shouldExit?: boolean }).shouldExit) {
            server.close(() => {
              void rm(options.socketPath, { force: true }).catch(() => {});
              process.exit(0);
            });
          }
        });
      });

      await new Promise<void>((resolvePromise, reject) => {
        server.once("error", reject);
        server.listen(options.socketPath, () => resolvePromise());
      });

      await reconcileManagedRuntime({
        env: options.env,
        infraManager,
        processSupervisor,
      }).catch(() => null);
      await writeDaemonState({
        serviceState: "ready",
        summary: "daemon ready",
      });
      await refreshLayeredStatus();

      return server;
    },
  };
}
