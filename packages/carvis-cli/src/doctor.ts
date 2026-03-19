import { codexCliHealthcheck } from "@carvis/bridge-codex";
import { probeFeishuCredentials } from "@carvis/channel-feishu";
import { createPostgresClient, createRedisClient, loadRuntimeConfig } from "@carvis/core";

import {
  createDockerEngine,
  DockerCliMissingError,
  DockerComposeMissingError,
} from "./docker-engine.ts";
import { resolveCarvisRuntimeFileSet, type CarvisRuntimeFileSet } from "./config-writer.ts";
import { createStatusService } from "./status.ts";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type DoctorCheck = {
  checkId: string;
  detail?: string;
  layer?: "daemon" | "external_dependency" | "infra" | "install" | "runtime";
  message: string;
  recommendedAction?: string;
  status: "failed" | "passed" | "skipped";
};

export function summarizeDoctorChecks(checks: DoctorCheck[]) {
  const failedChecks = checks.filter((check) => check.status === "failed");

  return {
    checks,
    failedChecks,
    status: failedChecks.length > 0 ? "failed" : "passed",
    summary: failedChecks.length > 0 ? `${failedChecks.length} checks failed` : "all checks passed",
  } as const;
}

export function createDoctorService(options: {
  createPostgresClientImpl?: typeof createPostgresClient;
  createRedisClientImpl?: typeof createRedisClient;
  dockerEngine?: ReturnType<typeof createDockerEngine>;
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  fileSet?: CarvisRuntimeFileSet;
  healthcheckCodex?: typeof codexCliHealthcheck;
  probeFeishuCredentialsImpl?: typeof probeFeishuCredentials;
} = {}) {
  const fileSet = options.fileSet ?? resolveCarvisRuntimeFileSet({
    homeDir: options.env?.HOME,
  });
  const fetchImpl = options.fetchImpl ?? fetch;
  const codexHealthcheck = options.healthcheckCodex ?? codexCliHealthcheck;
  const dockerEngine = options.dockerEngine ?? createDockerEngine({
    env: options.env,
  });
  const postgresFactory = options.createPostgresClientImpl ?? createPostgresClient;
  const redisFactory = options.createRedisClientImpl ?? createRedisClient;
  const feishuProbe = options.probeFeishuCredentialsImpl ?? probeFeishuCredentials;

  return {
    async run() {
      const layeredStatus = await createStatusService({
        dockerEngine,
        env: options.env,
        fetchImpl,
        fileSet,
      }).getStatus();
      const checks: DoctorCheck[] = [];
      let config: Awaited<ReturnType<typeof loadRuntimeConfig>> | null = null;

      try {
        config = await loadRuntimeConfig({
          configPath: fileSet.configPath,
          env: options.env,
        });
        checks.push({
          checkId: "runtime_config_valid",
          layer: "install",
          message: "runtime config loaded",
          status: "passed",
        });
      } catch (error) {
        checks.push({
          checkId: "runtime_config_valid",
          detail: error instanceof Error ? error.message : String(error),
          layer: "install",
          message: error instanceof Error ? error.message : String(error),
          recommendedAction: "carvis onboard",
          status: "failed",
        });
        return {
          ...summarizeDoctorChecks(checks),
          daemonLayer: layeredStatus.daemon,
          externalDependencyLayer: layeredStatus.externalDependencies,
          infraLayer: layeredStatus.infra,
          installLayer: layeredStatus.install,
          runtimeLayer: layeredStatus.runtime,
        };
      }

      const feishu = await feishuProbe({
        appId: config.secrets.feishuAppId,
        appSecret: config.secrets.feishuAppSecret,
      });
      checks.push({
        checkId: "feishu_credentials",
        detail: feishu.ok ? undefined : feishu.code,
        layer: "external_dependency",
        message: feishu.message,
        recommendedAction: feishu.ok ? undefined : "carvis onboard",
        status: feishu.ok ? "passed" : "failed",
      });

      const dockerCheck = await dockerEngine.preflight()
        .then<DoctorCheck>(() => ({
          checkId: "docker_engine",
          layer: "infra",
          message: "docker ready",
          status: "passed",
        }))
        .catch<DoctorCheck>((error) => ({
          checkId: "docker_engine",
          detail: error instanceof Error ? error.message : String(error),
          layer: error instanceof DockerCliMissingError || error instanceof DockerComposeMissingError
            ? "install" as const
            : "infra" as const,
          message: error instanceof Error ? error.message : String(error),
          recommendedAction: error instanceof DockerCliMissingError || error instanceof DockerComposeMissingError
            ? "carvis install"
            : "carvis infra start",
          status: "failed" as const,
        }));
      checks.push(dockerCheck);

      if (dockerCheck.status === "failed") {
        checks.push({
          checkId: "postgres_ping",
          layer: "infra",
          message: "postgres check skipped because docker is unavailable",
          recommendedAction: dockerCheck.recommendedAction,
          status: "skipped",
        });
        checks.push({
          checkId: "redis_ping",
          layer: "infra",
          message: "redis check skipped because docker is unavailable",
          recommendedAction: dockerCheck.recommendedAction,
          status: "skipped",
        });
      } else {
        const postgres = await postgresFactory(config.secrets.postgresUrl)
          .then(async (client) => {
            const ok = await client.ping();
            await client.close();
            return ok;
          })
          .then<DoctorCheck>(() => ({
            checkId: "postgres_ping",
            layer: "infra",
            message: "postgres reachable",
            status: "passed",
          }))
          .catch((error) => ({
            checkId: "postgres_ping",
            detail: error instanceof Error ? error.message : String(error),
            layer: "infra" as const,
            message: error instanceof Error ? error.message : String(error),
            recommendedAction: "carvis infra start",
            status: "failed" as const,
          }));
        checks.push(postgres);

        const redis = await redisFactory(config.secrets.redisUrl)
          .then(async (client) => {
            const ok = await client.ping();
            await client.close();
            return ok;
          })
          .then<DoctorCheck>(() => ({
            checkId: "redis_ping",
            layer: "infra",
            message: "redis reachable",
            status: "passed",
          }))
          .catch((error) => ({
            checkId: "redis_ping",
            detail: error instanceof Error ? error.message : String(error),
            layer: "infra" as const,
            message: error instanceof Error ? error.message : String(error),
            recommendedAction: "carvis infra start",
            status: "failed" as const,
          }));
        checks.push(redis);
      }

      const codex = await codexHealthcheck()
        .then((result) => ({
          checkId: "codex_cli",
          layer: "external_dependency" as const,
          message: result.message,
          status: "passed" as const,
        }))
        .catch((error) => ({
          checkId: "codex_cli",
          detail: error instanceof Error ? error.message : String(error),
          layer: "external_dependency" as const,
          message: error instanceof Error ? error.message : String(error),
          recommendedAction: "codex --version",
          status: "failed" as const,
        }));
      checks.push(codex);

      const healthz = await fetchImpl(`http://127.0.0.1:${config.gateway.port}${config.gateway.healthPath}`)
        .then(async (response) => {
          const payload = await response.json() as {
            state?: {
              last_error?: { code?: string } | null;
              ready?: boolean;
            };
          };
          if (!payload.state?.ready) {
            return {
              checkId: "gateway_healthz",
              detail: payload.state?.last_error?.code ?? "GATEWAY_NOT_READY",
              layer: "runtime" as const,
              message: "gateway not ready",
              recommendedAction: "carvis daemon restart",
              status: "failed" as const,
            };
          }
          return {
            checkId: "gateway_healthz",
            layer: "runtime" as const,
            message: "gateway ready",
            status: "passed" as const,
          };
        })
        .catch((error) => ({
          checkId: "gateway_healthz",
          detail: error instanceof Error ? error.message : String(error),
          layer: "runtime" as const,
          message: error instanceof Error ? error.message : String(error),
          recommendedAction: "carvis daemon restart",
          status: "failed" as const,
        }));
      checks.push(healthz);

      return {
        ...summarizeDoctorChecks(checks),
        daemonLayer: layeredStatus.daemon,
        externalDependencyLayer: layeredStatus.externalDependencies,
        infraLayer: layeredStatus.infra,
        installLayer: layeredStatus.install,
        runtimeLayer: layeredStatus.runtime,
      };
    },
  };
}
