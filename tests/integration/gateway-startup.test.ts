import { afterEach, describe, expect, test } from "bun:test";

import { createRuntimeLogger } from "@carvis/core";

import { startGateway } from "../../apps/gateway/src/index.ts";
import { createHarness } from "../support/harness.ts";
import { createFeishuPayload, createSignedHeaders } from "../support/harness.ts";
import { createRuntimeHarness } from "../support/runtime-harness.ts";

describe("gateway startup", () => {
  const cleanupCallbacks: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanupCallbacks.length > 0) {
      const cleanup = cleanupCallbacks.pop();
      await cleanup?.();
    }
  });

  test("配置缺失时拒绝启动", async () => {
    const harness = await createRuntimeHarness({
      env: {
        FEISHU_APP_SECRET: "",
      },
    });
    cleanupCallbacks.push(harness.cleanup);

    await expect(
      startGateway({
        env: harness.env,
      }),
    ).rejects.toThrow("FEISHU_APP_SECRET is required");
  });

  test("启动后写入 runtime 日志并暴露 ready healthz", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);
    const logger = createRuntimeLogger();

    const started = await startGateway({
      env: harness.env,
      createRuntimeServices: async () => createGatewayRuntimeServicesFixture({ logger }),
      createFeishuIngress: async () =>
        createGatewayIngressFixture({
          ready: true,
        }),
      serve: (options) => ({
        port: Number(options.port),
        stop() {},
      }),
    });

    const response = await started.app.request("http://localhost/healthz");
    const body = (await response.json()) as {
      ok: boolean;
      state: {
        ready: boolean;
        feishu_ready: boolean;
        feishu_ingress_ready: boolean;
      };
    };

    expect(body.ok).toBe(true);
    expect(body.state.ready).toBe(true);
    expect(body.state.feishu_ready).toBe(true);
    expect(body.state.feishu_ingress_ready).toBe(true);
    expect(logger.listEntries()).toContainEqual(
      expect.objectContaining({
        level: "info",
        message: "runtime.gateway.ready",
        context: expect.objectContaining({
          role: "gateway",
          status: "ready",
        }),
      }),
    );
  });

  test("runtime bootstrap 下 webhook allowlist 继承 feishu.allowFrom 配置", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);
    const logger = createRuntimeLogger();

    const started = await startGateway({
      env: harness.env,
      createRuntimeServices: async () =>
        createGatewayRuntimeServicesFixture({
          allowFrom: ["chat-allowed"],
          logger,
        }),
      createFeishuIngress: async () =>
        createGatewayIngressFixture({
          ready: true,
        }),
      serve: (options) => ({
        port: Number(options.port),
        stop() {},
      }),
    });
    cleanupCallbacks.push(started.stop);

    const payload = createFeishuPayload("hello", {
      chat_id: "chat-blocked",
    });
    const body = JSON.stringify(payload);
    const response = await started.app.request("http://localhost/webhooks/feishu", {
      method: "POST",
      body,
      headers: createSignedHeaders(body, "test_app_secret"),
    });

    expect(response.status).toBe(403);
  });
});

function createGatewayRuntimeServicesFixture(input: {
  allowFrom?: string[];
  logger: ReturnType<typeof createRuntimeLogger>;
}) {
  const harness = createHarness();

  return {
    config: {
      agent: {
        id: "codex-main",
        bridge: "codex" as const,
        workspace: "/tmp/carvis-workspace",
        timeoutSeconds: 60,
        maxConcurrent: 1,
      },
      gateway: {
        port: 8787,
        healthPath: "/healthz",
      },
      executor: {
        pollIntervalMs: 1000,
      },
      feishu: {
        allowFrom: input.allowFrom ?? ["*"],
        requireMention: false,
      },
      secrets: {
        feishuAppId: "cli_test_app",
        feishuAppSecret: "test_app_secret",
        postgresUrl: "postgres://carvis:carvis@127.0.0.1:5432/carvis_test",
        redisUrl: "redis://127.0.0.1:6379/1",
      },
    },
    configFingerprint: "fingerprint-001",
    logger: input.logger,
    postgres: {
      close: async () => {},
      ping: async () => true,
      query: async () => ({ rows: [] }),
    },
    redis: {
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
    },
    cancelSignals: harness.cancelSignals,
    heartbeats: harness.heartbeats,
    queue: harness.queue,
    repositories: harness.repositories,
    workspaceLocks: harness.workspaceLocks,
  };
}

async function createGatewayIngressFixture(input: { ready: boolean }) {
  return {
    async emit() {},
    async start() {
      return {
        ready: input.ready,
      };
    },
    async stop() {},
  };
}
