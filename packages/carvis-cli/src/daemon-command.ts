import { readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";

import { createDaemonClient } from "./daemon-client.ts";
import { resolveManagedInstallLayout } from "./install-layout.ts";

type DaemonCommandResult = Record<string, unknown> & {
  status: string;
  summary: string;
};

export function createDaemonCommandService(options: {
  daemonClient?: ReturnType<typeof createDaemonClient>;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  spawnDaemon?: (input: { command: string; args: string[]; env: Record<string, string> }) => Promise<void>;
} = {}) {
  const layout = resolveManagedInstallLayout({
    homeDir: options.env?.HOME,
  });
  const daemonClient = options.daemonClient ?? createDaemonClient({
    env: options.env,
  });

  return {
    async run(input: {
      operation: "restart" | "start" | "status" | "stop";
    }): Promise<DaemonCommandResult> {
      if (input.operation === "status") {
        const response = await daemonClient.request({
          action: "daemon_status",
        }).catch(async () => {
          const cached = await daemonClient.readCachedStatus();
          return cached ?? {
            daemon: {
              serviceState: "stopped",
              socketReachable: false,
            },
            status: "stopped",
            summary: "daemon not reachable",
          };
        });
        return {
          command: "daemon",
          operation: "status",
          ...normalizeDaemonResult(response),
        };
      }

      if (input.operation === "start") {
        const manifest = await readManifest(layout.installManifestPath);
        if (!manifest) {
          return {
            command: "daemon",
            operation: "start",
            reason: "not_installed",
            status: "failed",
            summary: "carvis install is required before daemon start",
          };
        }

        await (options.spawnDaemon ?? defaultSpawnDaemon)({
          args: manifest.bundle.components.daemon.args,
          command: manifest.bundle.components.daemon.program,
          env: buildEnv(options.env),
        });

        const response = await waitForStatus(daemonClient);
        return {
          command: "daemon",
          operation: "start",
          ...normalizeDaemonResult(response),
        };
      }

      if (input.operation === "stop") {
        const response = await daemonClient.request({
          action: "daemon_stop",
        }).catch(() => ({
          daemon: {
            serviceState: "stopped",
            socketReachable: false,
          },
          status: "stopped",
          summary: "daemon stopped",
        }));
        return {
          command: "daemon",
          operation: "stop",
          ...normalizeDaemonResult(response),
        };
      }

      await daemonClient.request({
        action: "daemon_stop",
      }).catch(() => null);
      return this.run({
        operation: "start",
      });
    },
  };
}

async function readManifest(path: string): Promise<{
  bundle: {
    components: {
      daemon: {
        args: string[];
        program: string;
      };
    };
  };
} | null> {
  const content = await readFile(path, "utf8").catch(() => null);
  return content ? JSON.parse(content) : null;
}

async function waitForStatus(daemonClient: ReturnType<typeof createDaemonClient>) {
  const deadline = Date.now() + 10_000;
  while (Date.now() <= deadline) {
    const response = await daemonClient.request({
      action: "daemon_status",
    }).catch(() => null);
    if (response) {
      return response;
    }
    await Bun.sleep(100);
  }
  return {
    daemon: {
      serviceState: "starting",
      socketReachable: false,
    },
    status: "starting",
    summary: "daemon starting",
  };
}

function normalizeDaemonResult(value: Record<string, unknown>): DaemonCommandResult {
  return {
    ...value,
    status: typeof value.status === "string" ? value.status : "failed",
    summary: typeof value.summary === "string" ? value.summary : "daemon command failed",
  };
}

function buildEnv(env: Record<string, string | undefined> | undefined) {
  return Object.fromEntries(
    Object.entries(env ?? process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

async function defaultSpawnDaemon(input: { command: string; args: string[]; env: Record<string, string> }) {
  await stat(input.command);
  const child = spawn(input.command, input.args, {
    detached: true,
    env: input.env,
    stdio: "ignore",
  });
  child.unref();
}
