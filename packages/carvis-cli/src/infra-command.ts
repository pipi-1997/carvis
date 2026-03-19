import { readFile } from "node:fs/promises";

import { createDaemonClient } from "./daemon-client.ts";
import { resolveManagedInstallLayout } from "./install-layout.ts";

type InfraState = {
  postgres: {
    status: string;
    summary: string;
  };
  redis: {
    status: string;
    summary: string;
  };
};

export function createInfraCommandService(options: {
  daemonClient?: ReturnType<typeof createDaemonClient>;
  env?: Record<string, string | undefined>;
} = {}) {
  const layout = resolveManagedInstallLayout({
    homeDir: options.env?.HOME,
  });
  const daemonClient = options.daemonClient ?? createDaemonClient({
    env: options.env,
  });

  return {
    async run(input: {
      operation: "rebuild" | "restart" | "start" | "status" | "stop";
    }) {
      if (input.operation === "status") {
        const daemonResult = await daemonClient.request({
          action: "infra_status",
        }).catch(() => null);
        if (daemonResult) {
          return {
            command: "infra",
            operation: "status",
            ...daemonResult,
          };
        }
        const state = await readInfraState(layout.stateDir);
        return {
          command: "infra",
          infra: state,
          operation: "status",
          status: deriveLayerStatus(state),
          summary: `${deriveLayerStatus(state)} infra`,
        };
      }

      const action = input.operation === "rebuild" ? "infra_rebuild" : `infra_${input.operation}`;
      const daemonResult = await daemonClient.request({
        action: action as "infra_rebuild" | "infra_restart" | "infra_start" | "infra_stop",
      }).catch(() => null);
      if (daemonResult) {
        return {
          command: "infra",
          operation: input.operation,
          ...daemonResult,
        };
      }

      const fallbackState = await readInfraState(layout.stateDir);
      return {
        command: "infra",
        infra: fallbackState,
        operation: input.operation,
        reason: "daemon_unreachable",
        status: "failed",
        summary: "daemon not reachable",
      };
    },
  };
}

function deriveLayerStatus(state: InfraState) {
  const componentStatuses = [state.postgres.status, state.redis.status];
  if (componentStatuses.every((status) => status === "ready")) {
    return "ready";
  }
  if (componentStatuses.every((status) => status === "stopped")) {
    return "stopped";
  }
  if (componentStatuses.some((status) => status === "failed")) {
    return "failed";
  }
  return "degraded";
}

async function readInfraState(stateDir: string): Promise<InfraState> {
  const content = await readFile(`${stateDir}/infra.json`, "utf8").catch(() => null);
  if (!content) {
    return {
      postgres: { status: "stopped", summary: "postgres stopped" },
      redis: { status: "stopped", summary: "redis stopped" },
    };
  }
  return JSON.parse(content) as InfraState;
}
