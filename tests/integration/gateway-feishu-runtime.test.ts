import { describe, expect, test } from "bun:test";

import { createRuntimeLogger } from "@carvis/core";

import { bootstrapGatewayRuntime } from "../../apps/gateway/src/bootstrap.ts";
import { createFeishuWebsocketTestTransport } from "../../packages/channel-feishu/src/index.ts";
import { TEST_AGENT_CONFIG, createHarness } from "../support/harness.ts";

describe("gateway feishu runtime wiring", () => {
  test("websocket 合法消息进入既有 session 与 run 流程", async () => {
    const harness = createHarness();
    const logger = createRuntimeLogger();
    const transport = createFeishuWebsocketTestTransport();

    const runtime = await bootstrapGatewayRuntime({
      createRuntimeServices: async () => ({
        config: {
          agent: TEST_AGENT_CONFIG,
          gateway: {
            port: 8787,
            healthPath: "/healthz",
          },
          executor: {
            pollIntervalMs: 1000,
          },
          feishu: {
            allowFrom: ["chat-001"],
            requireMention: true,
          },
          secrets: {
            feishuAppId: "cli_test_app",
            feishuAppSecret: "test_app_secret",
            postgresUrl: "postgres://carvis:carvis@127.0.0.1:5432/carvis_test",
            redisUrl: "redis://127.0.0.1:6379/1",
          },
        },
        configFingerprint: "fingerprint-001",
        logger,
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
      }),
      transportFactory: transport,
    });

    await runtime.ingress.start();
    await runtime.ingress.emit({
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
          message_id: "msg-001",
          message_type: "text",
          content: JSON.stringify({
            text: "@carvis 帮我总结仓库目标",
          }),
          mentions: [{ name: "carvis" }],
        },
      },
    });

    const latestRun = await harness.repositories.runs.getLatestRunByChat("feishu", "chat-001");
    expect(latestRun?.status).toBe("queued");
    expect(latestRun?.prompt).toBe("帮我总结仓库目标");
    expect(runtime.health.snapshot().state.ready).toBe(false);
  });
});
