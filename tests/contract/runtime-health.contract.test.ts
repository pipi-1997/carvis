import { describe, expect, test } from "bun:test";

import { createGatewayApp } from "../../apps/gateway/src/app.ts";
import { createGatewayRuntimeHealth } from "../../apps/gateway/src/services/runtime-health.ts";
import { TEST_AGENT_CONFIG, createHarness } from "../support/harness.ts";

describe("gateway runtime health contract", () => {
  test("GET /healthz 返回结构化 runtime 状态", async () => {
    const harness = createHarness();
    const health = createGatewayRuntimeHealth({
      configFingerprint: "fingerprint-001",
    });
    health.markHttpListening();
    health.markFeishuReady();
    health.markFeishuIngressReady();
    const app = createGatewayApp({
      agentConfig: TEST_AGENT_CONFIG,
      adapter: harness.adapter,
      repositories: harness.repositories,
      queue: harness.queue,
      workspaceResolverConfig: harness.workspaceResolverConfig,
      cancelSignals: harness.cancelSignals,
      allowlist: {
        isAllowed: () => true,
      },
      notifier: harness.notifier,
      health,
    });

    const response = await app.request("http://localhost/healthz");
    const body = (await response.json()) as {
      ok: boolean;
      state: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.state).toEqual({
      http_listening: true,
      config_valid: true,
      feishu_ready: true,
      feishu_ingress_ready: true,
      config_fingerprint: "fingerprint-001",
      ready: true,
      last_error: null,
    });
  });

  test("CONFIG_DRIFT 会把 healthz 降级为 ready=false 并暴露错误码", async () => {
    const harness = createHarness();
    const health = createGatewayRuntimeHealth({
      configFingerprint: "fingerprint-001",
    });
    health.markHttpListening();
    health.markConfigDrift("gateway/executor runtime fingerprints differ");
    const app = createGatewayApp({
      agentConfig: TEST_AGENT_CONFIG,
      adapter: harness.adapter,
      repositories: harness.repositories,
      queue: harness.queue,
      workspaceResolverConfig: harness.workspaceResolverConfig,
      cancelSignals: harness.cancelSignals,
      allowlist: {
        isAllowed: () => true,
      },
      notifier: harness.notifier,
      health,
    });

    const response = await app.request("http://localhost/healthz");
    const body = (await response.json()) as {
      ok: boolean;
      state: {
        ready: boolean;
        last_error: {
          code: string;
          message: string;
        } | null;
      };
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.state.ready).toBe(false);
    expect(body.state.last_error).toEqual({
      code: "CONFIG_DRIFT",
      message: "gateway/executor runtime fingerprints differ",
    });
  });
});
