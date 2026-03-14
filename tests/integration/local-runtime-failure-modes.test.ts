import { afterEach, describe, expect, test } from "bun:test";

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
import { createFeishuWebsocketTestTransport } from "@carvis/channel-feishu";

import { startGateway } from "../../apps/gateway/src/index.ts";
import { runExecutor } from "../../apps/executor/src/index.ts";

describe("local runtime failure modes", () => {
  const cleanupCallbacks: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanupCallbacks.length > 0) {
      const cleanup = cleanupCallbacks.pop();
      await cleanup?.();
    }
  });

  test("CONFIG_DRIFT 会让 gateway healthz 降级并阻止 executor 消费", async () => {
    const sharedRedis = createRuntimeStore();
    const gatewayServices = createRuntimeServicesFixture("/tmp/workspace-a", sharedRedis);
    const executorServices = createRuntimeServicesFixture("/tmp/workspace-b", sharedRedis);

    const gateway = await startGateway({
      createRuntimeServices: async () => gatewayServices,
      createScheduleManagementIpcServer: async () => ({ socketPath: "test.sock", async stop() {} }),
      serve: (options) => ({
        port: Number(options.port),
        stop() {},
      }),
      transportFactory: createFeishuWebsocketTestTransport(),
    });
    cleanupCallbacks.push(gateway.stop);

    const executor = await runExecutor({
      autoStartLoop: false,
      createBridge: () => createBridge(),
      createRuntimeServices: async () => executorServices,
    });
    cleanupCallbacks.push(executor.stop);

    const response = await gateway.app.request("http://localhost/healthz");
    const body = (await response.json()) as {
      state: {
        last_error: { code: string; message: string } | null;
        ready: boolean;
      };
    };

    expect(executor.startupReport.status).toBe("failed");
    expect(executor.startupReport.errorCode).toBe("CONFIG_DRIFT");
    expect(await executor.tick()).toBe(false);
    expect(body.state.ready).toBe(false);
    expect(body.state.last_error).toEqual({
      code: "CONFIG_DRIFT",
      message: "gateway/executor runtime fingerprints differ",
    });
  });
});

function createRuntimeServicesFixture(workspace: string, runtimeStore: Map<string, string>) {
  const config = {
    agent: {
      id: "codex-main",
      bridge: "codex" as const,
      defaultWorkspace: "main",
      workspace,
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
      requireMention: true,
    },
    workspaceResolver: {
      registry: {
        main: workspace,
      },
      chatBindings: {},
      sandboxModes: {
        main: "workspace-write" as const,
      },
      managedWorkspaceRoot: "/tmp/carvis-managed-workspaces",
      templatePath: "/tmp/carvis-workspace-template",
    },
    triggers: {
      scheduledJobs: [],
      webhooks: [],
    },
    secrets: {
      feishuAppId: "cli_test_app",
      feishuAppSecret: "test_app_secret",
      postgresUrl: "postgres://carvis:carvis@127.0.0.1:5432/carvis_test",
      redisUrl: "redis://127.0.0.1:6379/1",
    },
  };

  return {
    cancelSignals: new CancelSignalStore(),
    config,
    configFingerprint: buildRuntimeFingerprint(config),
    heartbeats: new HeartbeatMonitor(),
    logger: createRuntimeLogger(),
    postgres: {
      close: async () => {},
      ping: async () => true,
      query: async <T>() => ({ rows: [] as T[] }),
    },
    queue: new RunQueue(),
    redis: {
      close: async () => {},
      ping: async () => true,
      raw: {
        get: async (key: string) => runtimeStore.get(key) ?? null,
        set: async (key: string, value: string) => {
          runtimeStore.set(key, value);
          return "OK";
        },
      },
    },
    repositories: createInMemoryRepositories(),
    workspaceLocks: new WorkspaceLockManager(),
  };
}

function createRuntimeStore() {
  return new Map<string, string>();
}

function createBridge() {
  return new CodexBridge({
    transport: createScriptedCodexTransport([
      {
        type: "result",
        resultSummary: "runtime ready",
      },
    ]),
  });
}
