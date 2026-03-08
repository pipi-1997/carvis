import { afterEach, describe, expect, test } from "bun:test";

import { createRuntimeServices } from "@carvis/core";

import { createRuntimeHarness } from "../support/runtime-harness.ts";

describe("runtime services", () => {
  const cleanupCallbacks: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanupCallbacks.length > 0) {
      const cleanup = cleanupCallbacks.pop();
      await cleanup?.();
    }
  });

  test("装配 postgres repositories 与 redis coordination drivers", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);
    const executedSql: Array<{ params?: unknown[]; sql: string }> = [];
    const query = async <T>(sql: string, params?: unknown[]) => {
      executedSql.push({ sql, params });
      return { rows: [] as T[] };
    };

    const services = await createRuntimeServices({
      env: harness.env,
      createPostgresClient: async (connectionString) => ({
        connectionString,
        close: async () => {},
        ping: async () => true,
        query,
        withConnection: async <T>(handler: (client: { query: typeof query }) => Promise<T>) => {
          return handler({
            query,
          });
        },
      }),
      createRedisClient: async (connectionString) => ({
        connectionString,
        close: async () => {},
        ping: async () => true,
        raw: {
          del: async () => 1,
          get: async () => null,
          keys: async () => [],
          llen: async () => 0,
          lpop: async () => null,
          lrange: async () => [],
          lrem: async () => 0,
          pexpire: async () => 1,
          psetex: async () => "OK",
          quit: async () => "OK",
          rpush: async () => 1,
          set: async () => "OK",
        },
      }),
    });

    expect(services.repositories).toBeDefined();
    expect(services.queue).toBeDefined();
    expect(services.workspaceLocks).toBeDefined();
    expect(services.heartbeats).toBeDefined();
    expect(services.cancelSignals).toBeDefined();
    expect(executedSql).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: "SELECT pg_advisory_lock($1, $2)",
          params: [20260308, 1],
        }),
        expect.objectContaining({
          sql: expect.stringContaining("CREATE TABLE IF NOT EXISTS sessions"),
        }),
        expect.objectContaining({
          sql: "SELECT pg_advisory_unlock($1, $2)",
          params: [20260308, 1],
        }),
      ]),
    );
  });
});
