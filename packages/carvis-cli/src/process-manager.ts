import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { loadRuntimeConfig } from "@carvis/core";

import { resolveCarvisRuntimeFileSet, type CarvisRuntimeFileSet } from "./config-writer.ts";
import { createCarvisStateStore } from "./state-store.ts";

type RuntimeRole = "gateway" | "executor";
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type SpawnedRuntimeProcess = {
  pid: number;
  stop(): Promise<void>;
};

type ProcessManagerStartResult = {
  executor: Awaited<ReturnType<ReturnType<typeof createCarvisStateStore>["read"]>>;
  gateway: Awaited<ReturnType<ReturnType<typeof createCarvisStateStore>["read"]>>;
  reason?: string;
  status: "failed" | "ready";
  summary: string;
};

type ProcessManagerStopResult = {
  missing: Array<RuntimeRole>;
  removedState: Array<RuntimeRole>;
  status: "failed" | "partial" | "stopped";
  summary: string;
};

type ProcessManagerOptions = {
  env?: Record<string, string | undefined>;
  executorReadyTimeoutMs?: number;
  fetchImpl?: FetchLike;
  fileSet?: CarvisRuntimeFileSet;
  gatewayReadyTimeoutMs?: number;
  processExists?: (pid: number) => boolean;
  signalProcess?: (pid: number, signal?: NodeJS.Signals | number) => void;
  sleep?: (ms: number) => Promise<void>;
  stopTimeoutMs?: number;
  spawn?: (input: {
    env: Record<string, string>;
    logPath: string;
    role: RuntimeRole;
  }) => Promise<SpawnedRuntimeProcess>;
  stateStore?: ReturnType<typeof createCarvisStateStore>;
};

const DEFAULT_GATEWAY_READY_TIMEOUT_MS = 30_000;
const DEFAULT_EXECUTOR_READY_TIMEOUT_MS = 30_000;
const DEFAULT_STOP_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 100;
const REPO_ROOT = resolve(import.meta.dir, "../../..");

export function createProcessManager(options: ProcessManagerOptions = {}) {
  const fileSet = options.fileSet ?? resolveCarvisRuntimeFileSet({
    homeDir: options.env?.HOME,
  });
  const stateStore = options.stateStore ?? createCarvisStateStore({
    fileSet,
    processExists: options.processExists,
  });
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)));
  const fetchImpl = options.fetchImpl ?? fetch;
  const processExists = options.processExists ?? defaultProcessExists;
  const signalProcess = options.signalProcess ?? process.kill;
  const spawn = options.spawn ?? defaultSpawn;

  return {
    async start(): Promise<ProcessManagerStartResult> {
      await stateStore.cleanupStale();
      const running = await stateStore.readAll();
      if (running.gateway || running.executor) {
        return {
          executor: running.executor,
          gateway: running.gateway,
          reason: "ALREADY_RUNNING",
          status: "failed",
          summary: "runtime already running",
        };
      }

      const runtimeEnv = await loadRuntimeEnv(fileSet.runtimeEnvPath, options.env);
      const config = await loadRuntimeConfig({
        configPath: fileSet.configPath,
        env: runtimeEnv,
      });

      const handles: Partial<Record<RuntimeRole, SpawnedRuntimeProcess>> = {};

      try {
        handles.gateway = await spawn({
          env: buildChildEnv(runtimeEnv, fileSet, "gateway"),
          logPath: resolve(fileSet.logsDir, "gateway.log"),
          role: "gateway",
        });

        const gatewayReady = await waitForGatewayReady({
          fetchImpl,
          healthPath: config.gateway.healthPath,
          port: config.gateway.port,
          sleep,
          timeoutMs: options.gatewayReadyTimeoutMs ?? DEFAULT_GATEWAY_READY_TIMEOUT_MS,
        });
        if (!gatewayReady.ready) {
          throw new Error(gatewayReady.reason ?? "GATEWAY_NOT_READY");
        }

        handles.executor = await spawn({
          env: buildChildEnv(runtimeEnv, fileSet, "executor"),
          logPath: resolve(fileSet.logsDir, "executor.log"),
          role: "executor",
        });

        const executorState = await waitForExecutorState({
          sleep,
          stateStore,
          timeoutMs: options.executorReadyTimeoutMs ?? DEFAULT_EXECUTOR_READY_TIMEOUT_MS,
        });
        if (executorState?.status !== "ready") {
          throw new Error(
            executorState?.lastErrorCode ??
              executorState?.startupReport?.errorCode ??
              "EXECUTOR_NOT_READY",
          );
        }

        return {
          executor: executorState,
          gateway: await stateStore.read("gateway"),
          status: "ready",
          summary: "runtime ready",
        };
      } catch (error) {
        await rollback(handles, stateStore);
        const gateway = await stateStore.read("gateway");
        const executor = await stateStore.read("executor");
        return {
          executor,
          gateway,
          reason: error instanceof Error ? error.message : String(error),
          status: "failed",
          summary: error instanceof Error ? error.message : String(error),
        };
      }
    },
    async stop(): Promise<ProcessManagerStopResult> {
      const removedState: RuntimeRole[] = [];
      const missing: RuntimeRole[] = [];

      for (const role of ["executor", "gateway"] as const) {
        const state = await stateStore.read(role);
        if (!state) {
          continue;
        }

        if (!processExists(state.pid)) {
          missing.push(role);
          await stateStore.clear(role);
          removedState.push(role);
          continue;
        }

        try {
          signalProcess(state.pid, "SIGTERM");
        } catch (error) {
          missing.push(role);
          await stateStore.clear(role);
          removedState.push(role);
          continue;
        }
        const exited = await waitForProcessExit({
          pid: state.pid,
          processExists,
          sleep,
          timeoutMs: options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS,
        });
        if (!exited) {
          try {
            signalProcess(state.pid, "SIGKILL");
          } catch {
            missing.push(role);
          }
        }
        await stateStore.clear(role);
        removedState.push(role);
      }

      return {
        missing,
        removedState,
        status: missing.length > 0 ? "partial" : "stopped",
        summary: missing.length > 0 ? "runtime stopped with partial cleanup" : "runtime stopped",
      };
    },
  };
}

async function rollback(
  handles: Partial<Record<RuntimeRole, SpawnedRuntimeProcess>>,
  stateStore: ReturnType<typeof createCarvisStateStore>,
) {
  for (const role of ["executor", "gateway"] as const) {
    await handles[role]?.stop().catch(() => {});
    await stateStore.clear(role);
  }
}

async function waitForExecutorState(input: {
  sleep: (ms: number) => Promise<void>;
  stateStore: ReturnType<typeof createCarvisStateStore>;
  timeoutMs: number;
}) {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() <= deadline) {
    const state = await input.stateStore.read("executor");
    if (state?.status === "ready" || state?.status === "failed") {
      return state;
    }
    await input.sleep(POLL_INTERVAL_MS);
  }
  return input.stateStore.read("executor");
}

async function waitForGatewayReady(input: {
  fetchImpl: FetchLike;
  healthPath: string;
  port: number;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
}) {
  const deadline = Date.now() + input.timeoutMs;
  let lastReason: string | undefined;

  while (Date.now() <= deadline) {
    try {
      const response = await input.fetchImpl(`http://127.0.0.1:${input.port}${input.healthPath}`);
      const payload = await response.json() as {
        state?: {
          last_error?: {
            code?: string;
          } | null;
          ready?: boolean;
        };
      };

      if (payload.state?.ready) {
        return {
          ready: true,
        };
      }

      lastReason = payload.state?.last_error?.code ?? "GATEWAY_NOT_READY";
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }

    await input.sleep(POLL_INTERVAL_MS);
  }

  return {
    ready: false,
    reason: lastReason ?? "GATEWAY_NOT_READY",
  };
}

async function loadRuntimeEnv(
  runtimeEnvPath: string,
  baseEnv: Record<string, string | undefined> | undefined,
): Promise<Record<string, string>> {
  const merged = Object.fromEntries(
    Object.entries(baseEnv ?? process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  const content = await readFile(runtimeEnvPath, "utf8").catch(() => "");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const [key, ...rest] = line.split("=");
    if (!key || merged[key] !== undefined) {
      continue;
    }
    merged[key] = rest.join("=");
  }
  return merged;
}

async function waitForProcessExit(input: {
  pid: number;
  processExists: (pid: number) => boolean;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
}) {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() <= deadline) {
    if (!input.processExists(input.pid)) {
      return true;
    }
    await input.sleep(POLL_INTERVAL_MS);
  }
  return !input.processExists(input.pid);
}

function buildChildEnv(
  env: Record<string, string>,
  fileSet: CarvisRuntimeFileSet,
  role: RuntimeRole,
): Record<string, string> {
  return {
    ...env,
    CARVIS_LOG_PATH: resolve(fileSet.logsDir, `${role}.log`),
    CARVIS_STATE_DIR: fileSet.stateDir,
    HOME: env.HOME ?? resolve(fileSet.configDir, ".."),
  };
}

async function defaultSpawn(input: {
  env: Record<string, string>;
  logPath: string;
  role: RuntimeRole;
}): Promise<SpawnedRuntimeProcess> {
  await mkdir(dirname(input.logPath), { recursive: true }).catch(() => {});
  const logFile = await open(input.logPath, "a");
  const command = input.role === "gateway"
    ? ["bun", "run", "--filter", "@carvis/gateway", "dev"]
    : ["bun", "run", "--filter", "@carvis/executor", "dev"];
  const child = Bun.spawn(command, {
    cwd: REPO_ROOT,
    env: input.env,
    stderr: logFile.fd,
    stdout: logFile.fd,
  });

  return {
    pid: child.pid,
    async stop() {
      child.kill();
      await child.exited.catch(() => {});
      await logFile.close();
    },
  };
}

function defaultProcessExists(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
