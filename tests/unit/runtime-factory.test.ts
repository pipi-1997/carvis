import { afterEach, describe, expect, test } from "bun:test";

import { createRuntimeDependencies } from "@carvis/core";

import { createRuntimeHarness } from "../support/runtime-harness.ts";

describe("runtime factory", () => {
  const cleanupCallbacks: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanupCallbacks.length > 0) {
      const cleanup = cleanupCallbacks.pop();
      await cleanup?.();
    }
  });

  test("加载 runtime 配置并装配依赖容器", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);

    const runtime = await createRuntimeDependencies({
      env: harness.env,
      createPostgresClient: async (connectionString) => ({
        kind: "postgres",
        connectionString,
      }),
      createRedisClient: async (connectionString) => ({
        kind: "redis",
        connectionString,
      }),
    });

    expect(runtime.config.agent.id).toBe("codex-main");
    expect(runtime.config.agent.defaultWorkspace).toBe("main");
    expect(runtime.config.agent.workspace).toBe(runtime.config.workspaceResolver.registry.main);
    expect(runtime.configFingerprint.length).toBeGreaterThan(10);
    expect(runtime.postgres.kind).toBe("postgres");
    expect(runtime.redis.kind).toBe("redis");
    expect(runtime.logger.listEntries()).toEqual([]);
  });

  test("真实 runtime logger 会镜像到终端", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);
    const infoLogs: string[] = [];
    const originalInfo = console.info;

    console.info = (...args: unknown[]) => {
      infoLogs.push(args.map((arg) => String(arg)).join(" "));
    };

    try {
      const runtime = await createRuntimeDependencies({
        env: harness.env,
        createPostgresClient: async (connectionString) => ({
          kind: "postgres",
          connectionString,
        }),
        createRedisClient: async (connectionString) => ({
          kind: "redis",
          connectionString,
        }),
      });

      runtime.logger.executorState("ready", {
        configFingerprint: runtime.configFingerprint,
        postgresReady: true,
        redisReady: true,
        codexReady: true,
        consumerActive: true,
      });
    } finally {
      console.info = originalInfo;
    }

    expect(infoLogs.some((line) => line.includes("runtime.executor.ready"))).toBe(true);
  });
});
