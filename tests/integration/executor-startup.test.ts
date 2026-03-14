import { afterEach, describe, expect, test } from "bun:test";

import type { RuntimeConfig, RuntimeServices } from "@carvis/core";
import {
  CancelSignalStore,
  HeartbeatMonitor,
  RunQueue,
  WorkspaceLockManager,
  buildRuntimeFingerprint,
  createInMemoryRepositories,
  createRuntimeLogger,
} from "@carvis/core";
import { CodexBridge, createScriptedCodexTransport } from "@carvis/bridge-codex";

import { runExecutor } from "../../apps/executor/src/index.ts";
import { createRuntimeHarness } from "../support/runtime-harness.ts";

type Cleanup = () => Promise<void> | void;

describe("executor startup", () => {
  const cleanupCallbacks: Cleanup[] = [];

  afterEach(async () => {
    while (cleanupCallbacks.length > 0) {
      const cleanup = cleanupCallbacks.pop();
      await cleanup?.();
    }
  });

  test("输出结构化启动报告并进入 ready 状态", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);

    const runtimeServices = createFakeRuntimeServices(harness.env);
    const executor = await runExecutor({
      autoStartLoop: false,
      createBridge: () => createBridge(),
      createRuntimeServices: async () => runtimeServices,
      env: harness.env,
    });
    cleanupCallbacks.push(executor.stop);

    expect(executor.startupReport).toMatchObject({
      role: "executor",
      status: "ready",
      postgresReady: true,
      redisReady: true,
      codexReady: true,
      consumerActive: true,
    });
    expect(executor.startupReport.configFingerprint).toBe(runtimeServices.configFingerprint);
    expect(executor.loggerEntries().map((entry) => entry.message)).toEqual([
      "runtime.executor.starting",
      "runtime.executor.ready",
    ]);
  });

  test("依赖检查失败时输出 failed 启动报告并阻止消费循环", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);

    const runtimeServices = createFakeRuntimeServices(harness.env, {
      redisPing: async () => {
        throw new Error("redis unavailable");
      },
    });

    const executor = await runExecutor({
      autoStartLoop: false,
      createBridge: () => createBridge(),
      createRuntimeServices: async () => runtimeServices,
      env: harness.env,
    });
    cleanupCallbacks.push(executor.stop);

    expect(executor.startupReport).toMatchObject({
      status: "failed",
      postgresReady: true,
      redisReady: false,
      codexReady: true,
      consumerActive: false,
      errorCode: "REDIS_UNAVAILABLE",
    });
    expect(await executor.tick()).toBe(false);
    expect(executor.loggerEntries().at(-1)).toEqual({
      level: "error",
      message: "runtime.executor.failed",
      context: {
        role: "executor",
        status: "failed",
        configFingerprint: runtimeServices.configFingerprint,
        postgresReady: true,
        redisReady: false,
        codexReady: true,
        consumerActive: false,
        errorCode: "REDIS_UNAVAILABLE",
        errorMessage: "redis unavailable",
      },
    });
  });

  test("carvis-schedule readiness probe 失败时进入 CODEX_UNAVAILABLE", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);

    const runtimeServices = createFakeRuntimeServices(harness.env);
    const executor = await runExecutor({
      autoStartLoop: false,
      createBridge: () => new CodexBridge({
        healthcheck: async () => {
          throw new Error("carvis-schedule unavailable: command not found");
        },
        transport: createScriptedCodexTransport([
          {
            type: "result",
            resultSummary: "executor runtime ready",
          },
        ]),
      }),
      createRuntimeServices: async () => runtimeServices,
      env: harness.env,
    });
    cleanupCallbacks.push(executor.stop);

    expect(executor.startupReport).toMatchObject({
      status: "failed",
      postgresReady: true,
      redisReady: true,
      codexReady: false,
      consumerActive: false,
      errorCode: "CODEX_UNAVAILABLE",
      errorMessage: "carvis-schedule unavailable: command not found",
    });
    expect(await executor.tick()).toBe(false);
  });
});

function createFakeRuntimeServices(
  env: Record<string, string>,
  overrides: {
    codexHealthcheck?: () => Promise<{ ok: boolean; message: string }>;
    postgresPing?: () => Promise<boolean>;
    redisPing?: () => Promise<boolean>;
  } = {},
): RuntimeServices {
  const config = createRuntimeConfig(env);

  return {
    config,
    configFingerprint: buildRuntimeFingerprint(config),
    logger: createRuntimeLogger(),
    postgres: {
      close: async () => {},
      connectionString: env.POSTGRES_URL,
      ping: overrides.postgresPing ?? (async () => true),
      query: async <T>() => ({ rows: [] as T[] }),
    },
    redis: {
      close: async () => {},
      connectionString: env.REDIS_URL,
      ping: overrides.redisPing ?? (async () => true),
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
        rpush: async () => 1,
        set: async () => "OK",
      },
    },
    repositories: createInMemoryRepositories(),
    queue: new RunQueue(),
    workspaceLocks: new WorkspaceLockManager(),
    cancelSignals: new CancelSignalStore(),
    heartbeats: new HeartbeatMonitor(),
  };
}

function createBridge() {
  return new CodexBridge({
    transport: createScriptedCodexTransport([
      {
        type: "result",
        resultSummary: "executor runtime ready",
      },
    ]),
  });
}

function createRuntimeConfig(env: Record<string, string>): RuntimeConfig {
  return {
    agent: {
      id: "codex-main",
      bridge: "codex",
      defaultWorkspace: "main",
      workspace: "/tmp/carvis-runtime-workspace",
      timeoutSeconds: 60,
      maxConcurrent: 1,
    },
    gateway: {
      port: 8787,
      healthPath: "/healthz",
    },
    executor: {
      pollIntervalMs: 5,
    },
    feishu: {
      allowFrom: ["chat-001"],
      requireMention: false,
    },
    workspaceResolver: {
      registry: {
        main: "/tmp/carvis-runtime-workspace",
      },
      chatBindings: {},
      sandboxModes: {
        main: "workspace-write",
      },
      managedWorkspaceRoot: "/tmp/carvis-managed-workspaces",
      templatePath: "/tmp/carvis-workspace-template",
    },
    triggers: {
      scheduledJobs: [],
      webhooks: [],
    },
    secrets: {
      feishuAppId: env.FEISHU_APP_ID,
      feishuAppSecret: env.FEISHU_APP_SECRET,
      postgresUrl: env.POSTGRES_URL,
      redisUrl: env.REDIS_URL,
    },
  };
}
