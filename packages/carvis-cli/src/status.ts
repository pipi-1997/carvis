import { readFile } from "node:fs/promises";

import { readStructuredRuntimeConfig, resolveCarvisRuntimeFileSet, type CarvisRuntimeFileSet } from "./config-writer.ts";
import { createCarvisStateStore } from "./state-store.ts";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type RuntimeStatusSummary = ReturnType<typeof summarizeRuntimeStatus> & {
  adapter: "feishu" | null;
  configSource: "existing" | "missing";
};

export function summarizeRuntimeStatus(input: {
  executorState: Awaited<ReturnType<ReturnType<typeof createCarvisStateStore>["read"]>>;
  gatewayState: Awaited<ReturnType<ReturnType<typeof createCarvisStateStore>["read"]>>;
}) {
  const gatewayAlive = Boolean(input.gatewayState);
  const executorAlive = Boolean(input.executorState);
  const gatewayStatus = input.gatewayState?.healthSnapshot?.ready
    ? "ready"
    : (input.gatewayState?.status ?? "stopped");
  const executorStatus = input.executorState?.startupReport?.status
    ?? input.executorState?.status
    ?? "stopped";
  const overallStatus = resolveOverallStatus({
    executorStatus,
    gatewayReady: input.gatewayState?.healthSnapshot?.ready ?? false,
    gatewayStatus,
  });

  return {
    overallStatus,
    gateway: {
      alive: gatewayAlive,
      healthSnapshot: input.gatewayState?.healthSnapshot ?? null,
      lastErrorCode: input.gatewayState?.lastErrorCode ?? input.gatewayState?.healthSnapshot?.last_error?.code,
      lastErrorMessage:
        input.gatewayState?.lastErrorMessage ?? input.gatewayState?.healthSnapshot?.last_error?.message,
      logPath: input.gatewayState?.logPath ?? null,
      pid: input.gatewayState?.pid ?? null,
      status: gatewayStatus,
    },
    executor: {
      alive: executorAlive,
      lastErrorCode: input.executorState?.lastErrorCode ?? input.executorState?.startupReport?.errorCode,
      lastErrorMessage: input.executorState?.lastErrorMessage ?? input.executorState?.startupReport?.errorMessage,
      logPath: input.executorState?.logPath ?? null,
      pid: input.executorState?.pid ?? null,
      startupReport: input.executorState?.startupReport ?? null,
      status: executorStatus,
    },
  };
}

export function createStatusService(options: {
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  fileSet?: CarvisRuntimeFileSet;
  processExists?: (pid: number) => boolean;
  stateStore?: ReturnType<typeof createCarvisStateStore>;
} = {}) {
  const fileSet = options.fileSet ?? resolveCarvisRuntimeFileSet({
    homeDir: options.env?.HOME,
  });
  const stateStore = options.stateStore ?? createCarvisStateStore({
    fileSet,
    processExists: options.processExists,
  });
  const fetchImpl = options.fetchImpl ?? fetch;
  const processExists = options.processExists ?? defaultProcessExists;

  return {
    async getStatus(): Promise<RuntimeStatusSummary> {
      await stateStore.cleanupStale();
      let [gatewayState, executorState] = await Promise.all([
        stateStore.read("gateway"),
        stateStore.read("executor"),
      ]);
      if (gatewayState && !processExists(gatewayState.pid)) {
        gatewayState = null;
      }
      if (executorState && !processExists(executorState.pid)) {
        executorState = null;
      }
      const summary = summarizeRuntimeStatus({
        executorState,
        gatewayState,
      });
      const adapter = (await readAdapterFromConfig(fileSet)) ?? null;
      const config = await readStructuredRuntimeConfig(fileSet);

      if (gatewayState && config) {
        try {
          const response = await fetchImpl(`http://127.0.0.1:${config.gateway.port}${config.gateway.healthPath}`);
          if (response.ok) {
            const payload = await response.json() as {
              state?: Record<string, unknown>;
            };
            summary.gateway.healthSnapshot = (payload.state ?? summary.gateway.healthSnapshot) as typeof summary.gateway.healthSnapshot;
          }
        } catch {
          // 保持本地 state 视图，不因为瞬时请求失败抹掉状态。
        }
      }

      return {
        ...summary,
        adapter,
        configSource: adapter ? "existing" : "missing",
      };
    },
  };
}

async function readAdapterFromConfig(fileSet: CarvisRuntimeFileSet): Promise<"feishu" | null> {
  const content = await readFile(fileSet.configPath, "utf8").catch(() => null);
  if (!content) {
    return null;
  }
  return "feishu";
}

function defaultProcessExists(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function resolveOverallStatus(input: {
  executorStatus: string;
  gatewayReady: boolean;
  gatewayStatus: string;
}): "stopped" | "starting" | "ready" | "degraded" | "failed" {
  if (input.gatewayStatus === "stopped" && input.executorStatus === "stopped") {
    return "stopped";
  }
  if (input.gatewayReady && input.executorStatus === "ready") {
    return "ready";
  }
  if (input.gatewayStatus === "failed" || input.executorStatus === "failed") {
    return "failed";
  }
  if (input.gatewayStatus === "degraded" || input.executorStatus === "degraded") {
    return "degraded";
  }
  return "starting";
}
