import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ExecutorStartupReport, RuntimeErrorState, RuntimeStatus } from "../domain/runtime-models.ts";

export type LocalRuntimeRole = "gateway" | "executor";
export type LocalRuntimeProcessStatus = RuntimeStatus | "stopped";

export type GatewayRuntimeHealthSnapshot = {
  ok: boolean;
  state: {
    http_listening: boolean;
    config_valid: boolean;
    feishu_ready: boolean;
    feishu_ingress_ready: boolean;
    config_fingerprint: string;
    ready: boolean;
    last_error: RuntimeErrorState | null;
  };
};

export type LocalRuntimeProcessState = {
  configFingerprint: string;
  healthSnapshot?: GatewayRuntimeHealthSnapshot["state"];
  lastErrorCode?: string;
  lastErrorMessage?: string;
  logPath: string;
  pid: number;
  role: LocalRuntimeRole;
  startedAt: string;
  startupReport?: ExecutorStartupReport;
  status: LocalRuntimeProcessStatus;
};

type LocalRuntimeStateSinkOptions = {
  logPath: string;
  pid: number;
  role: LocalRuntimeRole;
  startedAt: string;
  stateDir: string;
};

export function createLocalRuntimeStateSink(options: LocalRuntimeStateSinkOptions) {
  return {
    async writeExecutorState(input: {
      startupReport: ExecutorStartupReport;
    }) {
      await writeLocalRuntimeProcessState(options.stateDir, {
        configFingerprint: input.startupReport.configFingerprint,
        lastErrorCode: input.startupReport.errorCode,
        lastErrorMessage: input.startupReport.errorMessage,
        logPath: options.logPath,
        pid: options.pid,
        role: "executor",
        startedAt: options.startedAt,
        startupReport: input.startupReport,
        status: input.startupReport.status,
      });
    },
    async writeGatewayState(input: {
      snapshot: GatewayRuntimeHealthSnapshot;
      status: RuntimeStatus;
    }) {
      await writeLocalRuntimeProcessState(options.stateDir, {
        configFingerprint: input.snapshot.state.config_fingerprint,
        healthSnapshot: input.snapshot.state,
        lastErrorCode: input.snapshot.state.last_error?.code,
        lastErrorMessage: input.snapshot.state.last_error?.message,
        logPath: options.logPath,
        pid: options.pid,
        role: "gateway",
        startedAt: options.startedAt,
        status: input.status,
      });
    },
    async writeStopped(input?: {
      configFingerprint?: string;
      errorCode?: string;
      errorMessage?: string;
    }) {
      await writeLocalRuntimeProcessState(options.stateDir, {
        configFingerprint: input?.configFingerprint ?? "",
        lastErrorCode: input?.errorCode,
        lastErrorMessage: input?.errorMessage,
        logPath: options.logPath,
        pid: options.pid,
        role: options.role,
        startedAt: options.startedAt,
        status: "stopped",
      });
    },
  };
}

export async function readLocalRuntimeProcessState(
  stateDir: string,
  role: LocalRuntimeRole,
): Promise<LocalRuntimeProcessState | null> {
  const content = await readFile(resolveLocalRuntimeStatePath(stateDir, role), "utf8").catch(() => null);
  if (!content) {
    return null;
  }
  return JSON.parse(content) as LocalRuntimeProcessState;
}

export async function writeLocalRuntimeProcessState(
  stateDir: string,
  state: LocalRuntimeProcessState,
): Promise<void> {
  await mkdir(stateDir, { recursive: true });
  await writeFile(resolveLocalRuntimeStatePath(stateDir, state.role), `${JSON.stringify(state, null, 2)}\n`);
}

export async function clearLocalRuntimeProcessState(stateDir: string, role: LocalRuntimeRole): Promise<void> {
  await rm(resolveLocalRuntimeStatePath(stateDir, role), {
    force: true,
  });
}

export async function readJsonStateFile<T>(path: string): Promise<T | null> {
  const content = await readFile(path, "utf8").catch(() => null);
  if (!content) {
    return null;
  }
  return JSON.parse(content) as T;
}

export async function writeJsonStateFile(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true }).catch(() => {});
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function resolveLocalRuntimeStatePath(stateDir: string, role: LocalRuntimeRole) {
  return join(stateDir, `${role}.json`);
}
