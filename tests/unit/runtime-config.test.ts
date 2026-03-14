import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

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
    expect(runtimeConfig.agent.defaultWorkspace).toBe("main");
    expect(runtimeConfig.workspaceResolver.registry.main).toBe(runtimeConfig.agent.workspace);
    expect(runtimeConfig.workspaceResolver.sandboxModes!.main).toBe("workspace-write");
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

  test("runtime fingerprint 对 default workspace / workspace resolver / feishu / 依赖目标敏感", () => {
    const baseConfig = createRuntimeConfigFixture();
    const changedConfig = createRuntimeConfigFixture({
      agent: {
        defaultWorkspace: "ops",
      },
      workspaceResolver: {
        registry: {
          main: "/tmp/carvis-runtime-workspace",
          ops: "/tmp/other-workspace",
        },
        sandboxModes: {
          main: "workspace-write",
          ops: "danger-full-access",
        },
      },
    });

    expect(buildRuntimeFingerprint(baseConfig)).not.toBe(buildRuntimeFingerprint(changedConfig));
  });

  test("加载 runtime trigger definitions 与 webhook secrets", async () => {
    const harness = await createRuntimeHarness({
      config: {
        triggers: {
          scheduledJobs: [
            {
              id: "daily-ops-report",
              enabled: true,
              workspace: "main",
              schedule: "0 9 * * *",
              promptTemplate: "生成今日巡检摘要",
              delivery: {
                kind: "feishu_chat",
                chatId: "oc_ops_group",
              },
            },
          ],
          webhooks: [
            {
              id: "build-failed",
              enabled: true,
              slug: "build-failed",
              workspace: "main",
              promptTemplate: "分析 {{summary}}",
              requiredFields: ["summary"],
              secretEnv: "CARVIS_WEBHOOK_BUILD_FAILED_SECRET",
              delivery: {
                kind: "none",
              },
            },
          ],
        },
      },
      env: {
        CARVIS_WEBHOOK_BUILD_FAILED_SECRET: "build-secret",
      },
    });
    cleanupCallbacks.push(harness.cleanup);

    const runtimeConfig = await loadRuntimeConfig({ env: harness.env });

    expect(runtimeConfig.triggers.scheduledJobs).toHaveLength(1);
    expect(runtimeConfig.triggers.webhooks).toHaveLength(1);
    expect(runtimeConfig.triggers.webhooks[0]?.secret).toBe("build-secret");
    expect(runtimeConfig.triggers.webhooks[0]?.slug).toBe("build-failed");
  });

  test("runtime fingerprint 对 trigger definitions 敏感", () => {
    const baseConfig = createRuntimeConfigFixture({
      triggers: {
        scheduledJobs: [
          {
            id: "daily-ops-report",
            enabled: true,
            workspace: "main",
            agentId: "codex-main",
            schedule: "0 9 * * *",
            timezone: null,
            promptTemplate: "生成今日巡检摘要",
            delivery: {
              kind: "none",
            },
          },
        ],
        webhooks: [],
      },
    });
    const changedConfig = createRuntimeConfigFixture({
      triggers: {
        scheduledJobs: [
          {
            id: "daily-ops-report",
            enabled: true,
            workspace: "main",
            agentId: "codex-main",
            schedule: "30 9 * * *",
            timezone: null,
            promptTemplate: "生成今日巡检摘要",
            delivery: {
              kind: "none",
            },
          },
        ],
        webhooks: [],
      },
    });

    expect(buildRuntimeFingerprint(baseConfig)).not.toBe(buildRuntimeFingerprint(changedConfig));
  });

  test("加载 runtime trigger definitions 与 webhook secrets", async () => {
    const harness = await createRuntimeHarness({
      config: {
        triggers: {
          scheduledJobs: [
            {
              id: "daily-ops-report",
              enabled: true,
              workspace: "main",
              schedule: "0 9 * * *",
              promptTemplate: "生成今日巡检摘要",
              delivery: {
                kind: "feishu_chat",
                chatId: "oc_ops_group",
              },
            },
          ],
          webhooks: [
            {
              id: "build-failed",
              enabled: true,
              slug: "build-failed",
              workspace: "main",
              promptTemplate: "分析 {{summary}}",
              requiredFields: ["summary"],
              secretEnv: "CARVIS_WEBHOOK_BUILD_FAILED_SECRET",
              delivery: {
                kind: "none",
              },
            },
          ],
        },
      },
      env: {
        CARVIS_WEBHOOK_BUILD_FAILED_SECRET: "build-secret",
      },
    });
    cleanupCallbacks.push(harness.cleanup);

    const runtimeConfig = await loadRuntimeConfig({ env: harness.env });

    expect(runtimeConfig.triggers.scheduledJobs).toHaveLength(1);
    expect(runtimeConfig.triggers.webhooks).toHaveLength(1);
    expect(runtimeConfig.triggers.webhooks[0]?.secret).toBe("build-secret");
    expect(runtimeConfig.triggers.webhooks[0]?.slug).toBe("build-failed");
  });

  test("runtime fingerprint 对 trigger definitions 敏感", () => {
    const baseConfig = createRuntimeConfigFixture({
      triggers: {
        scheduledJobs: [
          {
            id: "daily-ops-report",
            enabled: true,
            workspace: "main",
            agentId: "codex-main",
            schedule: "0 9 * * *",
            timezone: null,
            promptTemplate: "生成今日巡检摘要",
            delivery: {
              kind: "none",
            },
          },
        ],
        webhooks: [],
      },
    });
    const changedConfig = createRuntimeConfigFixture({
      triggers: {
        scheduledJobs: [
          {
            id: "daily-ops-report",
            enabled: true,
            workspace: "main",
            agentId: "codex-main",
            schedule: "30 9 * * *",
            timezone: null,
            promptTemplate: "生成今日巡检摘要",
            delivery: {
              kind: "none",
            },
          },
        ],
        webhooks: [],
      },
    });

    expect(buildRuntimeFingerprint(baseConfig)).not.toBe(buildRuntimeFingerprint(changedConfig));
  });

  test("defaultWorkspace 未命中 registry 时拒绝加载", async () => {
    const harness = await createRuntimeHarness({
      config: {
        agent: {
          defaultWorkspace: "missing",
        },
      },
    });
    cleanupCallbacks.push(harness.cleanup);

    await expect(loadRuntimeConfig({ env: harness.env })).rejects.toThrow(
      "agent.defaultWorkspace must exist in workspaceResolver.registry",
    );
  });

  test("chatBindings 引用不存在的 workspace key 时拒绝加载", async () => {
    const harness = await createRuntimeHarness({
      config: {
        workspaceResolver: {
          chatBindings: {
            "oc_test_chat": "missing",
          },
        },
      },
    });
    cleanupCallbacks.push(harness.cleanup);

    await expect(loadRuntimeConfig({ env: harness.env })).rejects.toThrow(
      "workspaceResolver.chatBindings must reference existing workspace keys",
    );
  });

  test("workspace sandboxModes 缺失默认工作区时拒绝加载", async () => {
    const extraWorkspace = join("/tmp", `carvis-runtime-workspace-ops-${Date.now()}`);
    const harness = await createRuntimeHarness({
      config: {
        workspaceResolver: {
          registry: {
            ops: extraWorkspace,
          },
        },
      },
    });
    cleanupCallbacks.push(harness.cleanup);
    await mkdir(extraWorkspace, { recursive: true });

    await expect(loadRuntimeConfig({ env: harness.env })).rejects.toThrow(
      "workspaceResolver.sandboxModes must define every workspace in workspaceResolver.registry",
    );
  });

  test("workspace sandboxModes 引用不存在的 workspace key 时拒绝加载", async () => {
    const harness = await createRuntimeHarness({
      config: {
        workspaceResolver: {
          sandboxModes: {
            main: "workspace-write",
            ghost: "danger-full-access",
          },
        },
      },
    });
    cleanupCallbacks.push(harness.cleanup);

    await expect(loadRuntimeConfig({ env: harness.env })).rejects.toThrow(
      "workspaceResolver.sandboxModes must only reference existing workspace keys",
    );
  });

  test("templatePath 缺失时仍可加载 runtime config", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);
    await rm(harness.paths.templateDir, {
      force: true,
      recursive: true,
    });

    const runtimeConfig = await loadRuntimeConfig({ env: harness.env });

    expect(runtimeConfig.workspaceResolver.templatePath).toBe(harness.paths.templateDir);
  });

  test("managedWorkspaceRoot 缺失时会让默认托管 workspace 失效", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);
    await rm(harness.paths.managedWorkspaceRoot, {
      force: true,
      recursive: true,
    });

    await expect(loadRuntimeConfig({ env: harness.env })).rejects.toThrow(
      "workspaceResolver.registry.main must point to an existing directory",
    );
  });

  test("defaultWorkspace 指向 managedWorkspaceRoot 之外时拒绝加载", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);
    const externalWorkspace = join(harness.paths.homeDir, "external-repo");
    const config = {
      agent: {
        id: "codex-main",
        bridge: "codex",
        defaultWorkspace: "main",
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
        allowFrom: ["*"],
        requireMention: false,
      },
      workspaceResolver: {
        registry: {
          main: externalWorkspace,
        },
        chatBindings: {},
        sandboxModes: {
          main: "workspace-write",
        },
        managedWorkspaceRoot: harness.paths.managedWorkspaceRoot,
        templatePath: harness.paths.templateDir,
      },
      triggers: {
        scheduledJobs: [],
        webhooks: [],
      },
    };

    await mkdir(externalWorkspace, { recursive: true });
    await writeFile(harness.paths.configFile, JSON.stringify(config, null, 2));

    await expect(loadRuntimeConfig({ env: harness.env })).rejects.toThrow(
      "workspaceResolver.registry.main must stay within workspaceResolver.managedWorkspaceRoot",
    );
  });

  test("非 default registry workspace 路径不存在时拒绝加载", async () => {
    const harness = await createRuntimeHarness({
      config: {
        workspaceResolver: {
          registry: {
            ops: "/tmp/carvis-missing-registry-workspace",
          },
          chatBindings: {
            "oc_test_chat": "ops",
          },
        },
      },
    });
    cleanupCallbacks.push(harness.cleanup);

    await expect(loadRuntimeConfig({ env: harness.env })).rejects.toThrow(
      "workspaceResolver.registry.ops must point to an existing directory",
    );
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

  test("runtime fingerprint 对 workspace sandboxModes 敏感", () => {
    const baseConfig = createRuntimeConfigFixture();
    const changedConfig = createRuntimeConfigFixture({
      workspaceResolver: {
        sandboxModes: {
          main: "danger-full-access",
        },
      },
    });

    expect(buildRuntimeFingerprint(baseConfig)).not.toBe(buildRuntimeFingerprint(changedConfig));
  });
});

type RuntimeConfigOverrides = {
  agent?: Partial<RuntimeConfig["agent"]>;
  gateway?: Partial<RuntimeConfig["gateway"]>;
  executor?: Partial<RuntimeConfig["executor"]>;
  feishu?: Partial<RuntimeConfig["feishu"]>;
  workspaceResolver?: Partial<RuntimeConfig["workspaceResolver"]>;
  secrets?: Partial<RuntimeConfig["secrets"]>;
  triggers?: Partial<RuntimeConfig["triggers"]>;
};

function createRuntimeConfigFixture(
  overrides: RuntimeConfigOverrides = {},
): RuntimeConfig {
  return {
    agent: {
      id: "codex-main",
      bridge: "codex",
      defaultWorkspace: "main",
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
    workspaceResolver: {
      registry: {
        main: "/tmp/carvis-runtime-workspace",
      },
      chatBindings: {},
      sandboxModes: {
        main: "workspace-write",
      },
      managedWorkspaceRoot: "/tmp/carvis-managed-workspaces",
      templatePath: "/tmp/carvis-template",
      ...overrides.workspaceResolver,
    },
    triggers: {
      scheduledJobs: [],
      webhooks: [],
      ...overrides.triggers,
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
