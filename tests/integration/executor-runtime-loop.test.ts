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

describe("executor runtime loop", () => {
  const cleanupCallbacks: Cleanup[] = [];

  afterEach(async () => {
    while (cleanupCallbacks.length > 0) {
      const cleanup = cleanupCallbacks.pop();
      await cleanup?.();
    }
  });

  test("消费循环会处理队列中的 run", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);

    const runtimeServices = createFakeRuntimeServices(harness.env);
    const session = await runtimeServices.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: runtimeServices.config.agent,
    });
    const run = await runtimeServices.repositories.runs.createQueuedRun({
      sessionId: session.id,
      agentId: runtimeServices.config.agent.id,
      workspace: runtimeServices.config.agent.workspace,
      prompt: "总结最近一次变更",
      triggerMessageId: "msg-001",
      triggerUserId: "user-001",
      timeoutSeconds: runtimeServices.config.agent.timeoutSeconds,
    });
    await runtimeServices.repositories.runs.updateQueuePosition(run.id, 0);
    await runtimeServices.queue.enqueue(runtimeServices.config.agent.workspace, run.id);

    const executor = await runExecutor({
      autoStartLoop: false,
      createBridge: () =>
        new CodexBridge({
          transport: createScriptedCodexTransport([
            { type: "summary", summary: "分析完成", sequence: 1 },
            { type: "result", resultSummary: "已输出最终摘要" },
          ]),
        }),
      createRuntimeServices: async () => runtimeServices,
      env: harness.env,
    });
    cleanupCallbacks.push(executor.stop);

    expect(await executor.tick()).toBe(true);

    const updatedRun = await runtimeServices.repositories.runs.getRunById(run.id);
    expect(updatedRun?.status).toBe("completed");
    expect(updatedRun?.finishedAt).not.toBeNull();
  });

  test("依赖在运行中失效时停止消费并输出 degraded 状态", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);

    let redisHealthy = true;
    const runtimeServices = createFakeRuntimeServices(harness.env, {
      redisPing: async () => redisHealthy,
    });
    const session = await runtimeServices.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: runtimeServices.config.agent,
    });
    const run = await runtimeServices.repositories.runs.createQueuedRun({
      sessionId: session.id,
      agentId: runtimeServices.config.agent.id,
      workspace: runtimeServices.config.agent.workspace,
      prompt: "分析失败路径",
      triggerMessageId: "msg-002",
      triggerUserId: "user-002",
      timeoutSeconds: runtimeServices.config.agent.timeoutSeconds,
    });
    await runtimeServices.repositories.runs.updateQueuePosition(run.id, 0);
    await runtimeServices.queue.enqueue(runtimeServices.config.agent.workspace, run.id);

    const executor = await runExecutor({
      autoStartLoop: false,
      createBridge: () =>
        new CodexBridge({
          transport: createScriptedCodexTransport([
            { type: "result", resultSummary: "不应执行到这里" },
          ]),
        }),
      createRuntimeServices: async () => runtimeServices,
      env: harness.env,
    });
    cleanupCallbacks.push(executor.stop);

    redisHealthy = false;

    expect(await executor.tick()).toBe(false);

    const unchangedRun = await runtimeServices.repositories.runs.getRunById(run.id);
    expect(unchangedRun?.status).toBe("queued");
    expect(executor.loggerEntries().at(-1)).toEqual({
      level: "warn",
      message: "runtime.executor.degraded",
      context: {
        role: "executor",
        status: "degraded",
        configFingerprint: runtimeServices.configFingerprint,
        postgresReady: true,
        redisReady: false,
        codexReady: true,
        consumerActive: false,
        errorCode: "REDIS_UNAVAILABLE",
        errorMessage: "redis ping returned false",
      },
    });
  });
});

function createFakeRuntimeServices(
  env: Record<string, string>,
  overrides: {
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
      managedWorkspaceRoot: "/tmp/carvis-managed-workspaces",
      templatePath: "/tmp/carvis-workspace-template",
    },
    secrets: {
      feishuAppId: env.FEISHU_APP_ID,
      feishuAppSecret: env.FEISHU_APP_SECRET,
      postgresUrl: env.POSTGRES_URL,
      redisUrl: env.REDIS_URL,
    },
  };
}
