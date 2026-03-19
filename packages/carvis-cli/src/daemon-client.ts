import { readFile } from "node:fs/promises";
import net from "node:net";

import { resolveManagedInstallLayout } from "./install-layout.ts";

export type DaemonClientRequest = {
  action:
    | "daemon_status"
    | "daemon_stop"
    | "infra_rebuild"
    | "infra_restart"
    | "infra_start"
    | "infra_status"
    | "infra_stop"
    | "runtime_reconcile";
  arguments?: Record<string, unknown>;
  requestId?: string;
};

export function createDaemonClient(options: {
  env?: Record<string, string | undefined>;
  socketPath?: string;
} = {}) {
  const layout = resolveManagedInstallLayout({
    homeDir: options.env?.HOME,
  });
  const socketPath = options.socketPath ?? layout.daemonSocketPath;

  return {
    async request(request: DaemonClientRequest): Promise<Record<string, unknown>> {
      return sendRequest(socketPath, request);
    },
    async readCachedStatus(): Promise<Record<string, unknown> | null> {
      const content = await readFile(layout.stateDir + "/layered-status.json", "utf8").catch(() => null);
      return content ? JSON.parse(content) as Record<string, unknown> : null;
    },
    socketPath,
  };
}

function sendRequest(socketPath: string, request: DaemonClientRequest): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, reject) => {
    const client = net.createConnection(socketPath);
    let buffer = "";

    client.on("connect", () => {
      client.write(`${JSON.stringify(request)}\n`);
    });
    client.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }
      const payload = buffer.slice(0, newlineIndex);
      client.end();
      resolvePromise(JSON.parse(payload) as Record<string, unknown>);
    });
    client.on("error", (error) => {
      reject(error);
    });
  });
}
