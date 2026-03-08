import { createClient } from "redis";

import type { RedisHeartbeatClient } from "./heartbeat.ts";
import type { RedisListClient } from "./queue.ts";
import type { RedisCancelClient } from "./cancel-signal.ts";
import type { RedisLockClient } from "./workspace-lock.ts";

export interface RedisCoordinationClient
  extends RedisListClient,
    RedisLockClient,
    RedisHeartbeatClient,
    RedisCancelClient {}

export interface RuntimeRedisClient {
  close(): Promise<void>;
  connectionString: string;
  ping(): Promise<boolean>;
  raw: RedisCoordinationClient;
}

export async function createRedisClient(connectionString: string): Promise<RuntimeRedisClient> {
  const client = createClient({
    url: connectionString,
  });

  await client.connect();
  await client.ping();

  return {
    async close() {
      await client.quit();
    },
    connectionString,
    async ping() {
      await client.ping();
      return true;
    },
    raw: {
      del: async (key: string) => client.del(key),
      get: async (key: string) => client.get(key),
      keys: async (pattern: string) => client.keys(pattern),
      llen: async (key: string) => client.lLen(key),
      lpop: async (key: string) => client.lPop(key),
      lrange: async (key: string, start: number, stop: number) => client.lRange(key, start, stop),
      lrem: async (key: string, count: number, value: string) => client.lRem(key, count, value),
      pexpire: async (key: string, ttlMs: number) => client.pExpire(key, ttlMs),
      psetex: async (key: string, ttlMs: number, value: string) => client.pSetEx(key, ttlMs, value),
      rpush: async (key: string, ...values: string[]) => client.rPush(key, values),
      set: async (key: string, value: string, mode?: "NX") =>
        ((mode === "NX" ? client.set(key, value, { NX: true }) : client.set(key, value)) as unknown) as
          | "OK"
          | null,
    },
  };
}
