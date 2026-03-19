import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import {
  readRuntimeEnvFile,
  resolveCarvisRuntimeFileSet,
  serializeRuntimeEnv,
} from "../../../packages/carvis-cli/src/config-writer.ts";
import { resolveManagedInstallLayout } from "../../../packages/carvis-cli/src/install-layout.ts";

type InfraComponentState = {
  status: string;
  summary: string;
};

type InfraState = {
  postgres: InfraComponentState;
  redis: InfraComponentState;
};

const execFileAsync = promisify(execFile);
const MANAGED_POSTGRES_URL = "postgres://carvis:carvis@127.0.0.1:5432/carvis";
const MANAGED_REDIS_URL = "redis://127.0.0.1:6379/0";

export function createManagedInfraManager(options: {
  env?: Record<string, string | undefined>;
  execImpl?: (
    file: string,
    args: string[],
    options?: { env?: Record<string, string | undefined> },
  ) => Promise<{ stderr: string; stdout: string }>;
}) {
  const fileSet = resolveCarvisRuntimeFileSet({
    homeDir: options.env?.HOME,
  });
  const layout = resolveManagedInstallLayout({
    homeDir: options.env?.HOME,
  });
  const env = options.env ?? process.env;
  const execImpl = options.execImpl ?? execFileAsync;

  return {
    async probe(): Promise<InfraState> {
      let composeState: Awaited<ReturnType<typeof readComposeState>>;
      try {
        composeState = await readComposeState({
          composeFilePath: layout.composeFilePath,
          composeEnvPath: layout.composeEnvPath,
          composeProjectName: layout.composeProjectName,
          env,
          execImpl,
        });
      } catch (error) {
        const state = buildFailedState(error);
        await this.write(state);
        return state;
      }

      const state = {
        postgres: composeComponentState(composeState.postgres, "postgres"),
        redis: composeComponentState(composeState.redis, "redis"),
      };

      if (state.postgres.status === "ready" && state.redis.status === "ready") {
        await ensureManagedRuntimeEnv(fileSet);
      }
      await this.write(state);
      return state;
    },
    async start(): Promise<InfraState> {
      const startError = await runComposeCommand({
        action: ["up", "-d", "postgres", "redis"],
        composeFilePath: layout.composeFilePath,
        composeEnvPath: layout.composeEnvPath,
        composeProjectName: layout.composeProjectName,
        env,
        execImpl,
      }).catch((error) => error);
      if (startError) {
        const state = buildFailedState(startError);
        await this.write(state);
        return state;
      }
      await ensureManagedRuntimeEnv(fileSet);
      return this.probe();
    },
    async restart(): Promise<InfraState> {
      const restartError = await runComposeCommand({
        action: ["stop", "postgres", "redis"],
        composeFilePath: layout.composeFilePath,
        composeEnvPath: layout.composeEnvPath,
        composeProjectName: layout.composeProjectName,
        env,
        execImpl,
      }).catch((error) => error);
      if (restartError) {
        const state = buildFailedState(restartError);
        await this.write(state);
        return state;
      }
      return this.start();
    },
    async rebuild(): Promise<InfraState> {
      const rebuildError = await runComposeCommand({
        action: ["down"],
        composeFilePath: layout.composeFilePath,
        composeEnvPath: layout.composeEnvPath,
        composeProjectName: layout.composeProjectName,
        env,
        execImpl,
      }).catch((error) => error);
      if (rebuildError) {
        const state = buildFailedState(rebuildError);
        await this.write(state);
        return state;
      }
      return this.start();
    },
    async read(): Promise<InfraState> {
      const content = await readFile(`${fileSet.stateDir}/infra.json`, "utf8").catch(() => null);
      if (!content) {
        return buildStoppedState();
      }
      return JSON.parse(content) as InfraState;
    },
    async stop() {
      const stopError = await runComposeCommand({
        action: ["stop", "postgres", "redis"],
        composeFilePath: layout.composeFilePath,
        composeEnvPath: layout.composeEnvPath,
        composeProjectName: layout.composeProjectName,
        env,
        execImpl,
      }).catch((error) => error);
      if (stopError) {
        const state = buildFailedState(stopError);
        await this.write(state);
        return state;
      }

      const state = buildStoppedState();
      await this.write(state);
      return state;
    },
    async write(state: InfraState) {
      await mkdir(fileSet.stateDir, { recursive: true });
      await writeFile(`${fileSet.stateDir}/infra.json`, `${JSON.stringify(state, null, 2)}\n`);
    },
  };
}

function buildStoppedState(): InfraState {
  return {
    postgres: { status: "stopped", summary: "postgres stopped" },
    redis: { status: "stopped", summary: "redis stopped" },
  };
}

function buildFailedState(error: unknown): InfraState {
  return {
    postgres: failedState(error),
    redis: failedState(error),
  };
}

async function ensureManagedRuntimeEnv(fileSet: Parameters<typeof resolveCarvisRuntimeFileSet>[0] extends never
  ? never
  : ReturnType<typeof resolveCarvisRuntimeFileSet>) {
  const runtimeEnv = await readRuntimeEnvFile(fileSet);
  const nextRuntimeEnv = {
    ...runtimeEnv,
    POSTGRES_URL: MANAGED_POSTGRES_URL,
    REDIS_URL: MANAGED_REDIS_URL,
  };

  await writeFile(fileSet.runtimeEnvPath, `${serializeRuntimeEnv(nextRuntimeEnv)}\n`);
}

async function runComposeCommand(input: {
  action: string[];
  composeFilePath: string;
  composeEnvPath: string;
  composeProjectName: string;
  env: Record<string, string | undefined>;
  execImpl: (
    file: string,
    args: string[],
    options?: { env?: Record<string, string | undefined> },
  ) => Promise<{ stderr: string; stdout: string }>;
}) {
  await input.execImpl("docker", [
    "compose",
    "--project-name",
    input.composeProjectName,
    "--file",
    input.composeFilePath,
    "--env-file",
    input.composeEnvPath,
    ...input.action,
  ], {
    env: input.env,
  });
}

async function readComposeState(input: {
  composeFilePath: string;
  composeEnvPath: string;
  composeProjectName: string;
  env: Record<string, string | undefined>;
  execImpl: (
    file: string,
    args: string[],
    options?: { env?: Record<string, string | undefined> },
  ) => Promise<{ stderr: string; stdout: string }>;
}) {
  const result = await input.execImpl("docker", [
    "compose",
    "--project-name",
    input.composeProjectName,
    "--file",
    input.composeFilePath,
    "--env-file",
    input.composeEnvPath,
    "ps",
    "--format",
    "json",
  ], {
    env: input.env,
  });

  const services = parseComposePs(result.stdout);
  return {
    postgres: services.find((service) => service.Service === "postgres") ?? null,
    redis: services.find((service) => service.Service === "redis") ?? null,
  };
}

function parseComposePs(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [] as Array<{ Health?: string; Service?: string; State?: string }>;
  }

  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as Array<{ Health?: string; Service?: string; State?: string }>;
  }

  return trimmed
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { Health?: string; Service?: string; State?: string });
}

function composeComponentState(
  service: { Health?: string; State?: string } | null,
  label: string,
): InfraComponentState {
  if (!service) {
    return {
      status: "stopped",
      summary: `${label} stopped`,
    };
  }

  const state = (service.State ?? "").toLowerCase();
  const health = (service.Health ?? "").toLowerCase();

  if (state === "running" && (health === "" || health === "healthy")) {
    return {
      status: "ready",
      summary: `${label} ready`,
    };
  }

  if (state === "running") {
    return {
      status: "degraded",
      summary: `${label} ${health || "running"}`,
    };
  }

  if (state === "exited" || state === "stopped") {
    return {
      status: "stopped",
      summary: `${label} stopped`,
    };
  }

  return {
    status: "failed",
    summary: `${label} ${state || "failed"}`,
  };
}

function failedState(error: unknown): InfraComponentState {
  return {
    status: "failed",
    summary: error instanceof Error ? error.message : String(error),
  };
}
