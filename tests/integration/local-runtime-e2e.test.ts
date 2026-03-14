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

describe("local runtime e2e", () => {
  const cleanupCallbacks: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanupCallbacks.length > 0) {
      const cleanup = cleanupCallbacks.pop();
      await cleanup?.();
    }
  });

  test("普通消息、/status、/abort 在本地双进程 runtime 下保持一致语义", async () => {
    const shared = createSharedRuntimeFixture();
    const transportFactory = createFeishuWebsocketTestTransport();

    const gateway = await startGateway({
      createRuntimeServices: async () => shared.services,
      createScheduleManagementIpcServer: async () => ({ socketPath: "test.sock", async stop() {} }),
      serve: (options) => ({
        port: Number(options.port),
        stop() {},
      }),
      transportFactory,
    });
    cleanupCallbacks.push(gateway.stop);

    const executor = await runExecutor({
      autoStartLoop: false,
      createBridge: () =>
        new CodexBridge({
          transport: createScriptedCodexTransport([
            { type: "summary", summary: "正在整理变更", sequence: 1 },
            { type: "result", resultSummary: "变更摘要已输出" },
          ]),
        }),
      createRuntimeServices: async () => shared.services,
    });
    cleanupCallbacks.push(executor.stop);

    await gateway.ingress.emit(createMessageEvent("@carvis 总结最近一次提交"));
    expect(await executor.tick()).toBe(true);

    await gateway.ingress.emit(createMessageEvent("@carvis /status", "msg-status"));
    await gateway.ingress.emit(createMessageEvent("@carvis /abort", "msg-abort"));

    const latestRun = await shared.services.repositories.runs.getLatestRunByChat("feishu", "chat-001");
    const deliveries = await shared.services.repositories.deliveries.listDeliveries();
    const contents = deliveries.map((delivery) => delivery.content);
    const deliveryKinds = deliveries.map((delivery) => delivery.deliveryKind);

    expect(latestRun?.status).toBe("completed");
    expect(contents.some((content) => content.includes("变更摘要已输出"))).toBe(true);
    expect(deliveryKinds).toEqual(
      expect.arrayContaining(["card_create", "status"]),
    );
    expect(contents.some((content) => content.includes("最近运行状态: completed"))).toBe(true);
    expect(contents.some((content) => content.includes("前方队列长度: 0"))).toBe(true);
    expect(contents).toContain("当前没有活动运行");
    expect(contents.some((content) => content.includes("已排队"))).toBe(false);
    expect(contents.some((content) => content.includes("已开始"))).toBe(false);
    expect(contents.some((content) => content.includes("正在整理变更"))).toBe(false);
  });
});

function createSharedRuntimeFixture() {
  const config = {
    agent: {
      id: "codex-main",
      bridge: "codex" as const,
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
      requireMention: true,
    },
    workspaceResolver: {
      registry: {
        main: "/tmp/carvis-runtime-workspace",
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
  const runtimeStore = new Map<string, string>();

  return {
    services: {
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
    },
  };
}

function createMessageEvent(text: string, messageId = "msg-001") {
  return {
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
    },
    event: {
      sender: {
        sender_id: {
          open_id: "user-001",
        },
      },
      message: {
        chat_id: "chat-001",
        chat_type: "p2p",
        message_id: messageId,
        message_type: "text",
        content: JSON.stringify({ text }),
        mentions: [{ name: "carvis" }],
      },
    },
  };
}
