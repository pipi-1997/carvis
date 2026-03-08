import {
  buildRuntimeScope,
  buildRuntimeFingerprint,
  loadRuntimeConfig,
} from "../config/runtime-config.ts";
import type { RuntimeConfig } from "../domain/runtime-models.ts";
import { createRuntimeLogger } from "../observability/runtime-logger.ts";
import { StructuredLogger, createConsoleLogSink } from "../observability/logger.ts";
import { RedisHeartbeatMonitor } from "./heartbeat.ts";
import { RedisRunQueue } from "./queue.ts";
import { RedisCancelSignalStore } from "./cancel-signal.ts";
import {
  createPostgresClient,
  type RuntimePostgresClient,
} from "../storage/postgres-client.ts";
import { createPostgresRepositories, type RepositoryBundle } from "../storage/repositories.ts";
import { runPostgresMigrations } from "../storage/migrate.ts";
import {
  createRedisClient,
  type RuntimeRedisClient,
} from "./redis-client.ts";
import { RedisWorkspaceLockManager } from "./workspace-lock.ts";
import type { CancelSignalDriver } from "./cancel-signal.ts";
import type { HeartbeatDriver } from "./heartbeat.ts";
import type { QueueDriver } from "./queue.ts";
import type { WorkspaceLockDriver } from "./workspace-lock.ts";

type RuntimeFactoryOptions<TPostgresClient = RuntimePostgresClient, TRedisClient = RuntimeRedisClient> = {
  config?: RuntimeConfig;
  createPostgresClient?: (connectionString: string) => Promise<TPostgresClient>;
  createRedisClient?: (connectionString: string) => Promise<TRedisClient>;
  env?: Record<string, string | undefined>;
};

const RUNTIME_FINGERPRINT_PREFIX = "carvis:runtime-fingerprint";

export interface RuntimeDependencies<
  TPostgresClient = RuntimePostgresClient,
  TRedisClient = RuntimeRedisClient,
> {
  config: RuntimeConfig;
  configFingerprint: string;
  runtimeScope?: string;
  logger: ReturnType<typeof createRuntimeLogger>;
  postgres: TPostgresClient;
  redis: TRedisClient;
}

export interface RuntimeServices<
  TPostgresClient = RuntimePostgresClient,
  TRedisClient = RuntimeRedisClient,
> extends RuntimeDependencies<TPostgresClient, TRedisClient> {
  cancelSignals: CancelSignalDriver;
  heartbeats: HeartbeatDriver;
  queue: QueueDriver;
  repositories: RepositoryBundle;
  workspaceLocks: WorkspaceLockDriver;
}

export async function createRuntimeDependencies<
  TPostgresClient = RuntimePostgresClient,
  TRedisClient = RuntimeRedisClient,
>(
  options: RuntimeFactoryOptions<TPostgresClient, TRedisClient> = {},
): Promise<RuntimeDependencies<TPostgresClient, TRedisClient>> {
  const config = options.config ?? (await loadRuntimeConfig({ env: options.env }));
  const postgresFactory =
    options.createPostgresClient ?? (createPostgresClient as (connectionString: string) => Promise<TPostgresClient>);
  const redisFactory =
    options.createRedisClient ?? (createRedisClient as (connectionString: string) => Promise<TRedisClient>);

  return {
    config,
    configFingerprint: buildRuntimeFingerprint(config),
    runtimeScope: buildRuntimeScope({
      agentId: config.agent.id,
      env: options.env,
    }),
    logger: createRuntimeLogger(
      new StructuredLogger({
        sink: createConsoleLogSink(),
      }),
    ),
    postgres: await postgresFactory(config.secrets.postgresUrl),
    redis: await redisFactory(config.secrets.redisUrl),
  };
}

export async function createRuntimeServices<
  TPostgresClient extends RuntimePostgresClient = RuntimePostgresClient,
  TRedisClient extends RuntimeRedisClient = RuntimeRedisClient,
>(
  options: RuntimeFactoryOptions<TPostgresClient, TRedisClient> = {},
): Promise<RuntimeServices<TPostgresClient, TRedisClient>> {
  const dependencies = await createRuntimeDependencies(options);

  await runPostgresMigrations(dependencies.postgres);

  return {
    ...dependencies,
    cancelSignals: new RedisCancelSignalStore(dependencies.redis.raw),
    heartbeats: new RedisHeartbeatMonitor(dependencies.redis.raw),
    queue: new RedisRunQueue(dependencies.redis.raw),
    repositories: createPostgresRepositories(dependencies.postgres),
    workspaceLocks: new RedisWorkspaceLockManager(dependencies.redis.raw),
  };
}

export async function publishRuntimeFingerprint(
  redis: {
    raw: {
      set(key: string, value: string, mode?: "NX"): Promise<string | null>;
    };
  },
  scope: string,
  role: "gateway" | "executor",
  fingerprint: string,
): Promise<void> {
  await redis.raw.set(`${RUNTIME_FINGERPRINT_PREFIX}:${scope}:${role}`, fingerprint);
}

export async function readRuntimeFingerprint(
  redis: { raw: Pick<RuntimeRedisClient["raw"], "get"> },
  scope: string,
  role: "gateway" | "executor",
): Promise<string | null> {
  return redis.raw.get(`${RUNTIME_FINGERPRINT_PREFIX}:${scope}:${role}`);
}

export async function detectRuntimeFingerprintDrift(
  redis: { raw: Pick<RuntimeRedisClient["raw"], "get"> },
  scope: string,
  role: "gateway" | "executor",
  fingerprint: string,
): Promise<string | null> {
  const peerRole = role === "gateway" ? "executor" : "gateway";
  const peerFingerprint = await readRuntimeFingerprint(redis, scope, peerRole);

  if (!peerFingerprint || peerFingerprint === fingerprint) {
    return null;
  }

  return "gateway/executor runtime fingerprints differ";
}
