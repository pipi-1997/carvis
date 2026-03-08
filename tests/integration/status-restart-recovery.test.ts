import { describe, expect, test } from "bun:test";

import { createGatewayApp } from "../../apps/gateway/src/app.ts";
import { createAllowlistGuard } from "../../apps/gateway/src/security/allowlist.ts";
import { createRunNotifier } from "../../apps/gateway/src/services/run-notifier.ts";
import { FeishuAdapter } from "../../packages/channel-feishu/src/adapter.ts";
import { TEST_AGENT_CONFIG, createSignedHeaders } from "../support/harness.ts";
import { createHarness, createFeishuPayload } from "../support/harness.ts";

describe("restart recovery", () => {
  test("网关重建后 /status 仍读取持久化状态", async () => {
    const harness = createHarness();

    await harness.postFeishuText("帮我总结仓库");
    await harness.executor.processNext();

    const adapter = new FeishuAdapter({
      signingSecret: "test-secret",
      sender: {
        addReaction: async () => {},
        removeReaction: async () => {},
        sendMessage: async () => ({ messageId: "delivery-restart" }),
      },
    });
    const gateway = createGatewayApp({
      agentConfig: TEST_AGENT_CONFIG,
      adapter,
      repositories: harness.repositories,
      queue: harness.queue,
      cancelSignals: harness.cancelSignals,
      allowlist: createAllowlistGuard(),
      notifier: createRunNotifier({
        adapter,
        repositories: harness.repositories,
      }),
      now: () => new Date("2026-03-08T00:10:00.000Z"),
    });
    const payload = createFeishuPayload("/status");
    const body = JSON.stringify(payload);

    const response = await gateway.request("http://localhost/webhooks/feishu", {
      method: "POST",
      headers: createSignedHeaders(body),
      body,
    });

    expect(response.status).toBe(200);
    const latestDelivery = (await harness.repositories.deliveries.listDeliveries()).at(-1);
    expect(latestDelivery?.content).toContain("最近运行状态: completed");
  });
});
