import { readFile, stat } from "node:fs/promises";

import { codexCliHealthcheck } from "@carvis/bridge-codex";
import { probeFeishuCredentials } from "@carvis/channel-feishu";

import {
  createDockerEngine,
  DockerCliMissingError,
  DockerComposeMissingError,
  DockerDaemonUnavailableError,
} from "./docker-engine.ts";
import { resolveManagedInstallLayout } from "./install-layout.ts";
import { readStructuredRuntimeConfig, resolveCarvisRuntimeFileSet, type CarvisRuntimeFileSet } from "./config-writer.ts";
import { createCarvisStateStore } from "./state-store.ts";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type RuntimeStatusSummary = ReturnType<typeof summarizeRuntimeStatus> & {
  adapter: "feishu" | null;
  configSource: "existing" | "missing";
  daemon: {
    pid: number | null;
    serviceState: string;
    socketPath: string;
    socketReachable: boolean;
    status: string;
    summary: string;
  };
  externalDependencies: {
    components: {
      codex_cli: {
        detail?: string;
        status: string;
        summary: string;
      };
      feishu_credentials: {
        detail?: string;
        status: string;
        summary: string;
      };
    };
    status: string;
    summary: string;
  };
  infra: {
    components: {
      postgres: {
        status: string;
        summary: string;
      };
      redis: {
        status: string;
        summary: string;
      };
    };
    status: string;
    summary: string;
  };
  install: {
    activeBundlePath: string | null;
    activeVersion: string | null;
    serviceDefinitionPath: string | null;
    status: string;
    summary: string;
  };
  recommendedActions: string[];
  runtime: {
    components: ReturnType<typeof summarizeRuntimeStatus>;
    status: string;
    summary: string;
  };
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
  dockerEngine?: ReturnType<typeof createDockerEngine>;
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  fileSet?: CarvisRuntimeFileSet;
  healthcheckCodex?: typeof codexCliHealthcheck;
  processExists?: (pid: number) => boolean;
  probeFeishuCredentialsImpl?: typeof probeFeishuCredentials;
  stateStore?: ReturnType<typeof createCarvisStateStore>;
} = {}) {
  const fileSet = options.fileSet ?? resolveCarvisRuntimeFileSet({
    homeDir: options.env?.HOME,
  });
  const installLayout = resolveManagedInstallLayout({
    homeDir: options.env?.HOME,
  });
  const stateStore = options.stateStore ?? createCarvisStateStore({
    fileSet,
    processExists: options.processExists,
  });
  const dockerEngine = options.dockerEngine ?? createDockerEngine({
    env: options.env,
  });
  const fetchImpl = options.fetchImpl ?? fetch;
  const healthcheckCodex = options.healthcheckCodex ?? codexCliHealthcheck;
  const processExists = options.processExists ?? defaultProcessExists;
  const probeFeishuCredentialsImpl = options.probeFeishuCredentialsImpl ?? probeFeishuCredentials;

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
      const legacyRuntimeMode = !gatewayState && !executorState
        ? false
        : !(await stat(installLayout.installManifestPath).then(() => true).catch(() => false));
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

      const installManifest = await readJson<{
        activeBundlePath: string;
        activeVersion: string;
        serviceDefinitionPath: string | null;
        status: string;
      }>(installLayout.installManifestPath);
      const daemonState = await readJson<{
        pid?: number | null;
        serviceState?: string;
        summary?: string;
      }>(`${fileSet.stateDir}/daemon.json`);
      const dockerPreflight = await dockerEngine.preflight()
        .then(() => ({
          layer: "infra" as const,
          status: "ready",
          summary: "docker ready",
        }))
        .catch((error) => summarizeDockerError(error));
      const infraState = await readJson<{
        postgres?: { status?: string; summary?: string };
        redis?: { status?: string; summary?: string };
      }>(`${fileSet.stateDir}/infra.json`);
      const runtimeEnv = await readFile(fileSet.runtimeEnvPath, "utf8").catch(() => "");
      const hasFeishuCredentials = runtimeEnv.includes("FEISHU_APP_ID=") && runtimeEnv.includes("FEISHU_APP_SECRET=");
      const codex = await healthcheckCodex()
        .then((result) => ({
          detail: result.message,
          status: result.ok ? "ready" : "failed",
          summary: result.message,
        }))
        .catch((error) => ({
          detail: error instanceof Error ? error.message : String(error),
          status: "failed",
          summary: error instanceof Error ? error.message : String(error),
        }));
      const feishu = hasFeishuCredentials && config
        ? await probeFeishuCredentialsImpl({
            appId: runtimeEnvValue(runtimeEnv, "FEISHU_APP_ID"),
            appSecret: runtimeEnvValue(runtimeEnv, "FEISHU_APP_SECRET"),
          }).then((result) => ({
            detail: result.ok ? undefined : result.code,
            status: result.ok ? "ready" : "failed",
            summary: result.message,
          }))
        : {
            status: "failed",
            summary: "feishu credentials missing",
          };
      const daemonSocketReachable = await stat(installLayout.daemonSocketPath).then(() => true).catch(() => false);

      const install = {
        activeBundlePath: installManifest?.activeBundlePath ?? null,
        activeVersion: installManifest?.activeVersion ?? null,
        serviceDefinitionPath: installManifest?.serviceDefinitionPath ?? installLayout.serviceDefinitionPath,
        status: installManifest
          ? (dockerPreflight.layer === "install" ? "failed" : installManifest.status)
          : "missing",
        summary: installManifest
          ? (dockerPreflight.layer === "install" ? dockerPreflight.summary : "install manifest present")
          : "carvis not installed",
      };
      const infra = {
        components: {
          postgres: {
            status: dockerPreflight.status === "failed" && installManifest ? "failed" : (infraState?.postgres?.status ?? "stopped"),
            summary: dockerPreflight.status === "failed" && installManifest
              ? dockerPreflight.summary
              : (infraState?.postgres?.summary ?? "postgres stopped"),
          },
          redis: {
            status: dockerPreflight.status === "failed" && installManifest ? "failed" : (infraState?.redis?.status ?? "stopped"),
            summary: dockerPreflight.status === "failed" && installManifest
              ? dockerPreflight.summary
              : (infraState?.redis?.summary ?? "redis stopped"),
          },
        },
        status: dockerPreflight.status === "failed" && installManifest
          ? "failed"
          : deriveComponentLayerStatus([
              infraState?.postgres?.status ?? "stopped",
              infraState?.redis?.status ?? "stopped",
            ]),
        summary: dockerPreflight.status === "failed" && installManifest ? dockerPreflight.summary : "local infrastructure",
      };
      const externalDependencies = {
        components: {
          codex_cli: codex,
          feishu_credentials: feishu,
        },
        status: deriveComponentLayerStatus([
          codex.status,
          feishu.status,
        ]),
        summary: "external dependencies",
      };
      const daemon = {
        pid: daemonState?.pid ?? null,
        serviceState: daemonState?.serviceState ?? (installManifest ? "stopped" : "not_installed"),
        socketPath: installLayout.daemonSocketPath,
        socketReachable: daemonSocketReachable,
        status: daemonSocketReachable
          ? "ready"
          : installManifest
            ? (daemonState?.serviceState ?? "stopped")
            : "not_installed",
        summary: daemonState?.summary ?? (daemonSocketReachable ? "daemon reachable" : "daemon not reachable"),
      };
      const runtime = {
        components: summary,
        status: summary.overallStatus,
        summary: "runtime summary",
      };
      const recommendedActions = buildRecommendedActions({
        daemonStatus: daemon.status,
        externalDependencyStatus: externalDependencies.status,
        infraStatus: infra.status,
        installStatus: install.status,
        legacyRuntimeMode,
        runtimeStatus: runtime.status,
      });

      return {
        ...summary,
        adapter,
        configSource: adapter ? "existing" : "missing",
        daemon,
        externalDependencies,
        infra,
        install,
        overallStatus: resolveLayeredOverallStatus({
          daemonStatus: daemon.status,
          externalDependencyStatus: externalDependencies.status,
          infraStatus: infra.status,
          installStatus: install.status,
          legacyRuntimeMode,
          runtimeStatus: summary.overallStatus,
        }),
        recommendedActions,
        runtime,
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

function deriveComponentLayerStatus(statuses: string[]) {
  if (statuses.every((status) => status === "ready")) {
    return "ready";
  }
  if (statuses.every((status) => status === "stopped")) {
    return "stopped";
  }
  if (statuses.some((status) => status === "failed")) {
    return "failed";
  }
  if (statuses.some((status) => status === "degraded")) {
    return "degraded";
  }
  return "starting";
}

function resolveLayeredOverallStatus(input: {
  daemonStatus: string;
  externalDependencyStatus: string;
  infraStatus: string;
  installStatus: string;
  legacyRuntimeMode: boolean;
  runtimeStatus: "degraded" | "failed" | "ready" | "starting" | "stopped";
}): "degraded" | "failed" | "ready" | "starting" | "stopped" {
  if (input.legacyRuntimeMode) {
    return input.runtimeStatus;
  }
  const statuses = [
    input.installStatus,
    input.infraStatus,
    input.externalDependencyStatus,
    input.daemonStatus,
    input.runtimeStatus,
  ];
  if (statuses.some((status) => status === "failed")) {
    return "failed";
  }
  if (statuses.some((status) => status === "degraded")) {
    return "degraded";
  }
  if (statuses.every((status) => status === "ready" || status === "installed")) {
    return "ready";
  }
  if (statuses.every((status) => status === "stopped" || status === "not_installed" || status === "missing")) {
    return "stopped";
  }
  return "starting";
}

function summarizeDockerError(error: unknown) {
  if (error instanceof DockerCliMissingError || error instanceof DockerComposeMissingError) {
    return {
      layer: "install" as const,
      status: "failed" as const,
      summary: error.message,
    };
  }

  if (error instanceof DockerDaemonUnavailableError) {
    return {
      layer: "infra" as const,
      status: "failed" as const,
      summary: error.message,
    };
  }

  return {
    layer: "infra" as const,
    status: "failed" as const,
    summary: error instanceof Error ? error.message : String(error),
  };
}

function buildRecommendedActions(input: {
  daemonStatus: string;
  externalDependencyStatus: string;
  infraStatus: string;
  installStatus: string;
  legacyRuntimeMode: boolean;
  runtimeStatus: string;
}) {
  const actions: string[] = [];
  if (input.legacyRuntimeMode) {
    if (input.runtimeStatus === "failed" || input.runtimeStatus === "degraded") {
      actions.push("carvis doctor");
    }
    return actions;
  }
  if (input.installStatus === "missing") {
    return ["carvis install"];
  }
  if (input.externalDependencyStatus === "failed") {
    actions.push("carvis doctor");
  }
  if (input.infraStatus === "failed" || input.infraStatus === "stopped") {
    actions.push("carvis infra start");
  }
  if (input.daemonStatus === "stopped" || input.daemonStatus === "not_installed") {
    actions.push("carvis daemon start");
  }
  if (input.runtimeStatus === "failed" || input.runtimeStatus === "degraded") {
    actions.push("carvis daemon restart");
  }
  return [...new Set(actions)];
}

async function readJson<T>(path: string): Promise<T | null> {
  const content = await readFile(path, "utf8").catch(() => null);
  return content ? JSON.parse(content) as T : null;
}

function runtimeEnvValue(content: string, key: string) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const [entryKey, ...rest] = line.split("=");
    if (entryKey === key) {
      return rest.join("=");
    }
  }
  return "";
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
