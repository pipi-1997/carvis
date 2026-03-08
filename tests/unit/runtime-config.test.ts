import { afterEach, describe, expect, test } from "bun:test";

import {
  buildRuntimeScope,
  buildRuntimeFingerprint,
  loadRuntimeConfig,
  type RuntimeConfig,
} from "@carvis/core";

import { createRuntimeHarness } from "../support/runtime-harness.ts";

describe("runtime config", () => {
  const cleanupCallbacks: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanupCallbacks.length > 0) {
      const cleanup = cleanupCallbacks.pop();
      await cleanup?.();
    }
  });

  test("从 ~/.carvis/config.json 和环境变量加载 websocket runtime 配置", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);

    const runtimeConfig = await loadRuntimeConfig({ env: harness.env });

    expect(runtimeConfig.agent.id).toBe("codex-main");
    expect(runtimeConfig.gateway.port).toBe(8787);
    expect(runtimeConfig.feishu.allowFrom).toEqual(["*"]);
    expect(runtimeConfig.secrets.feishuAppId).toBe("cli_test_app");
  });

  test("缺少 websocket 凭据时拒绝加载", async () => {
    const harness = await createRuntimeHarness({
      env: {
        FEISHU_APP_SECRET: "",
      },
    });
    cleanupCallbacks.push(harness.cleanup);

    await expect(loadRuntimeConfig({ env: harness.env })).rejects.toThrow(
      "FEISHU_APP_SECRET is required",
    );
  });

  test("相同配置生成稳定的 runtime fingerprint", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);

    const runtimeConfig = await loadRuntimeConfig({ env: harness.env });

    expect(buildRuntimeFingerprint(runtimeConfig)).toBe(buildRuntimeFingerprint(runtimeConfig));
  });

  test("runtime fingerprint 对 agent / workspace / feishu / 依赖目标敏感", () => {
    const baseConfig = createRuntimeConfigFixture();
    const changedConfig = createRuntimeConfigFixture({
      agent: {
        workspace: "/tmp/other-workspace",
      },
    });

    expect(buildRuntimeFingerprint(baseConfig)).not.toBe(buildRuntimeFingerprint(changedConfig));
  });

  test("runtime scope 对 agent 和配置路径敏感，用于隔离多实例 fingerprint", () => {
    const agentScope = buildRuntimeScope({
      agentId: "codex-main",
      configPath: "/Users/pipi/.carvis/config.json",
    });
    const otherAgentScope = buildRuntimeScope({
      agentId: "codex-other",
      configPath: "/Users/pipi/.carvis/config.json",
    });
    const otherConfigScope = buildRuntimeScope({
      agentId: "codex-main",
      configPath: "/tmp/another-carvis/config.json",
    });

    expect(agentScope).not.toBe(otherAgentScope);
    expect(agentScope).not.toBe(otherConfigScope);
  });
});

type RuntimeConfigOverrides = {
  agent?: Partial<RuntimeConfig["agent"]>;
  gateway?: Partial<RuntimeConfig["gateway"]>;
  executor?: Partial<RuntimeConfig["executor"]>;
  feishu?: Partial<RuntimeConfig["feishu"]>;
  secrets?: Partial<RuntimeConfig["secrets"]>;
};

function createRuntimeConfigFixture(
  overrides: RuntimeConfigOverrides = {},
): RuntimeConfig {
  return {
    agent: {
      id: "codex-main",
      bridge: "codex",
      workspace: "/tmp/carvis-runtime-workspace",
      timeoutSeconds: 60,
      maxConcurrent: 1,
      ...overrides.agent,
    },
    gateway: {
      port: 8787,
      healthPath: "/healthz",
      ...overrides.gateway,
    },
    executor: {
      pollIntervalMs: 1000,
      ...overrides.executor,
    },
    feishu: {
      allowFrom: ["*"],
      requireMention: false,
      ...overrides.feishu,
    },
    secrets: {
      feishuAppId: "cli_test_app",
      feishuAppSecret: "test_app_secret",
      postgresUrl: "postgres://carvis:carvis@127.0.0.1:5432/carvis_test",
      redisUrl: "redis://127.0.0.1:6379/1",
      ...overrides.secrets,
    },
  };
}
