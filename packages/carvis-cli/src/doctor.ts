import { codexCliHealthcheck } from "@carvis/bridge-codex";
import { probeFeishuCredentials } from "@carvis/channel-feishu";
import { createPostgresClient, createRedisClient, loadRuntimeConfig } from "@carvis/core";

import { resolveCarvisRuntimeFileSet, type CarvisRuntimeFileSet } from "./config-writer.ts";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type DoctorCheck = {
  checkId: string;
  detail?: string;
  message: string;
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
  const postgresFactory = options.createPostgresClientImpl ?? createPostgresClient;
  const redisFactory = options.createRedisClientImpl ?? createRedisClient;
  const feishuProbe = options.probeFeishuCredentialsImpl ?? probeFeishuCredentials;

  return {
    async run() {
      const checks: DoctorCheck[] = [];
      let config: Awaited<ReturnType<typeof loadRuntimeConfig>> | null = null;

      try {
        config = await loadRuntimeConfig({
          configPath: fileSet.configPath,
          env: options.env,
        });
        checks.push({
          checkId: "runtime_config_valid",
          message: "runtime config loaded",
          status: "passed",
        });
      } catch (error) {
        checks.push({
          checkId: "runtime_config_valid",
          detail: error instanceof Error ? error.message : String(error),
          message: error instanceof Error ? error.message : String(error),
          status: "failed",
        });
        return summarizeDoctorChecks(checks);
      }

      const feishu = await feishuProbe({
        appId: config.secrets.feishuAppId,
        appSecret: config.secrets.feishuAppSecret,
      });
      checks.push({
        checkId: "feishu_credentials",
        detail: feishu.ok ? undefined : feishu.code,
        message: feishu.message,
        status: feishu.ok ? "passed" : "failed",
      });

      const postgres = await postgresFactory(config.secrets.postgresUrl)
        .then(async (client) => {
          const ok = await client.ping();
          await client.close();
          return ok;
        })
        .then<DoctorCheck>(() => ({
          checkId: "postgres_ping",
          message: "postgres reachable",
          status: "passed",
        }))
        .catch((error) => ({
          checkId: "postgres_ping",
          detail: error instanceof Error ? error.message : String(error),
          message: error instanceof Error ? error.message : String(error),
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
          message: "redis reachable",
          status: "passed",
        }))
        .catch((error) => ({
          checkId: "redis_ping",
          detail: error instanceof Error ? error.message : String(error),
          message: error instanceof Error ? error.message : String(error),
          status: "failed" as const,
        }));
      checks.push(redis);

      const codex = await codexHealthcheck()
        .then((result) => ({
          checkId: "codex_cli",
          message: result.message,
          status: "passed" as const,
        }))
        .catch((error) => ({
          checkId: "codex_cli",
          detail: error instanceof Error ? error.message : String(error),
          message: error instanceof Error ? error.message : String(error),
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
              message: "gateway not ready",
              status: "failed" as const,
            };
          }
          return {
            checkId: "gateway_healthz",
            message: "gateway ready",
            status: "passed" as const,
          };
        })
        .catch((error) => ({
          checkId: "gateway_healthz",
          detail: error instanceof Error ? error.message : String(error),
          message: error instanceof Error ? error.message : String(error),
          status: "failed" as const,
        }));
      checks.push(healthz);

      return summarizeDoctorChecks(checks);
    },
  };
}
