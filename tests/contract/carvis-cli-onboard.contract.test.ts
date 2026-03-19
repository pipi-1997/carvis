import { describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { runCarvisCli } from "../../packages/carvis-cli/src/index.ts";
import { loadRuntimeConfig } from "../../packages/core/src/config/runtime-config.ts";
import { createCarvisCliHarness } from "../support/carvis-cli-harness.ts";

describe("carvis onboard contract", () => {
  test("首次引导会写配置并自动调用 start", async () => {
    const harness = await createCarvisCliHarness();
    const stdout: string[] = [];
    const startCalls: string[] = [];

    const exitCode = await runCarvisCli(["onboard"], {
      cwd: harness.workspacePath,
      env: {
        ...process.env,
        HOME: harness.homeDir,
      },
      onboardingPrompter: createScriptedPrompter({
        adapter: "feishu",
        allowFrom: "*",
        appId: "cli-app-id",
        appSecret: "cli-app-secret",
        requireMention: false,
        workspacePath: harness.workspacePath,
      }),
      probeFeishuCredentials: async () => ({
        message: "feishu credentials ready",
        ok: true,
      }),
      processManager: {
        start: async () => {
          startCalls.push("start");
          return {
            status: "ready",
            summary: "runtime ready",
          };
        },
      },
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(0);
    expect(startCalls).toEqual(["start"]);
    expect(await Bun.file(harness.fileSet.configPath).text()).toContain("\"defaultWorkspace\": \"main\"");
    expect(await Bun.file(harness.fileSet.runtimeEnvPath).text()).toContain("FEISHU_APP_ID=cli-app-id");
    expect(stdout.at(-1)).toContain("runtime ready");

    await harness.cleanup();
  });

  test("已有配置时允许复用并直接进入 start", async () => {
    const harness = await createCarvisCliHarness();
    await mkdir(join(harness.homeDir, ".carvis"), { recursive: true });
    await Bun.write(
      harness.fileSet.configPath,
      JSON.stringify({
        agent: {
          id: "codex-main",
          bridge: "codex",
          defaultWorkspace: "main",
          timeoutSeconds: 5400,
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
            main: harness.workspacePath,
          },
          chatBindings: {},
          sandboxModes: {
            main: "workspace-write",
          },
          managedWorkspaceRoot: harness.homeDir,
          templatePath: join(harness.homeDir, ".carvis", "templates", "default-workspace"),
        },
        triggers: {
          scheduledJobs: [],
          webhooks: [],
        },
      }),
    );

    const startCalls: string[] = [];
    const exitCode = await runCarvisCli(["onboard"], {
      cwd: harness.workspacePath,
      env: {
        ...process.env,
        HOME: harness.homeDir,
      },
      onboardingPrompter: createScriptedPrompter({
        existingConfigAction: "reuse",
      }),
      processManager: {
        start: async () => {
          startCalls.push("start");
          return {
            status: "ready",
            summary: "runtime ready",
          };
        },
      },
    });

    expect(exitCode).toBe(0);
    expect(startCalls).toEqual(["start"]);

    await harness.cleanup();
  });

  test("已有配置时允许修改而不是强制重填", async () => {
    const harness = await createCarvisCliHarness();
    await mkdir(join(harness.homeDir, ".carvis"), { recursive: true });
    await Bun.write(
      harness.fileSet.configPath,
      JSON.stringify({
        agent: {
          id: "codex-main",
          bridge: "codex",
          defaultWorkspace: "main",
          timeoutSeconds: 5400,
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
          allowFrom: ["chat-a"],
          requireMention: false,
        },
        workspaceResolver: {
          registry: {
            main: harness.workspacePath,
          },
          chatBindings: {},
          sandboxModes: {
            main: "workspace-write",
          },
          managedWorkspaceRoot: harness.homeDir,
          templatePath: join(harness.homeDir, ".carvis", "templates", "default-workspace"),
        },
        triggers: {
          scheduledJobs: [],
          webhooks: [],
        },
      }),
    );
    await Bun.write(
      harness.fileSet.runtimeEnvPath,
      [
        "FEISHU_APP_ID=old-app-id",
        "FEISHU_APP_SECRET=old-app-secret",
        "POSTGRES_URL=postgres://carvis",
        "REDIS_URL=redis://carvis",
      ].join("\n"),
    );

    const exitCode = await runCarvisCli(["onboard"], {
      cwd: harness.workspacePath,
      env: {
        ...process.env,
        HOME: harness.homeDir,
      },
      onboardingPrompter: createScriptedPrompter({
        allowFrom: "chat-b",
        appId: "new-app-id",
        appSecret: "new-app-secret",
        existingConfigAction: "modify",
        requireMention: true,
        workspacePath: harness.workspacePath,
      }),
      probeFeishuCredentials: async () => ({
        message: "feishu credentials ready",
        ok: true,
      }),
      processManager: {
        start: async () => ({
          status: "ready",
          summary: "runtime ready",
        }),
      },
    });

    expect(exitCode).toBe(0);
    const runtimeEnvText = await Bun.file(harness.fileSet.runtimeEnvPath).text();
    expect(runtimeEnvText).toContain("FEISHU_APP_ID=new-app-id");
    expect(runtimeEnvText).toContain("POSTGRES_URL=postgres://carvis");
    expect(runtimeEnvText).toContain("REDIS_URL=redis://carvis");
    expect(await Bun.file(harness.fileSet.configPath).text()).toContain("\"requireMention\": true");

    await harness.cleanup();
  });

  test("已有配置时允许取消，不启动也不改配置", async () => {
    const harness = await createCarvisCliHarness();
    await mkdir(join(harness.homeDir, ".carvis"), { recursive: true });
    await Bun.write(harness.fileSet.configPath, "{\"agent\":{\"id\":\"codex-main\",\"bridge\":\"codex\",\"defaultWorkspace\":\"main\",\"timeoutSeconds\":5400,\"maxConcurrent\":1},\"gateway\":{\"port\":8787,\"healthPath\":\"/healthz\"},\"executor\":{\"pollIntervalMs\":1000},\"feishu\":{\"allowFrom\":[\"*\"],\"requireMention\":false},\"workspaceResolver\":{\"registry\":{\"main\":\"" + harness.workspacePath + "\"},\"chatBindings\":{},\"sandboxModes\":{\"main\":\"workspace-write\"},\"managedWorkspaceRoot\":\"" + harness.homeDir + "\",\"templatePath\":\"" + join(harness.homeDir, ".carvis", "templates", "default-workspace") + "\"},\"triggers\":{\"scheduledJobs\":[],\"webhooks\":[]}}");

    const stdout: string[] = [];
    const exitCode = await runCarvisCli(["onboard"], {
      cwd: harness.workspacePath,
      env: {
        ...process.env,
        HOME: harness.homeDir,
      },
      onboardingPrompter: createScriptedPrompter({
        existingConfigAction: "cancel",
      }),
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(2);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual({
      command: "onboard",
      status: "cancelled",
      summary: "已取消 onboard，保留现有配置。",
    });

    await harness.cleanup();
  });

  test("飞书凭据探测失败时会短路，不写配置也不启动", async () => {
    const harness = await createCarvisCliHarness();
    const stdout: string[] = [];
    const startCalls: string[] = [];

    const exitCode = await runCarvisCli(["onboard"], {
      cwd: harness.workspacePath,
      env: {
        ...process.env,
        HOME: harness.homeDir,
      },
      onboardingPrompter: createScriptedPrompter({
        adapter: "feishu",
        allowFrom: "*",
        appId: "bad-app-id",
        appSecret: "bad-app-secret",
        requireMention: false,
        workspacePath: harness.workspacePath,
      }),
      probeFeishuCredentials: async () => ({
        code: "INVALID_CREDENTIALS",
        message: "invalid app credential",
        ok: false,
      }),
      processManager: {
        start: async () => {
          startCalls.push("start");
          return {
            status: "ready",
            summary: "runtime ready",
          };
        },
      },
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(3);
    expect(startCalls).toEqual([]);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual({
      command: "onboard",
      reason: "INVALID_CREDENTIALS",
      status: "failed",
      summary: "invalid app credential",
    });
    expect(await Bun.file(harness.fileSet.configPath).exists()).toBe(false);

    await harness.cleanup();
  });

  test("workspace 路径不存在时会返回结构化失败而不是抛异常", async () => {
    const harness = await createCarvisCliHarness();
    const stdout: string[] = [];
    const startCalls: string[] = [];
    const missingWorkspace = join(harness.homeDir, "missing-workspace");

    const exitCode = await runCarvisCli(["onboard"], {
      cwd: harness.workspacePath,
      env: {
        ...process.env,
        HOME: harness.homeDir,
      },
      onboardingPrompter: createScriptedPrompter({
        adapter: "feishu",
        allowFrom: "*",
        appId: "cli-app-id",
        appSecret: "cli-app-secret",
        requireMention: false,
        workspacePath: missingWorkspace,
      }),
      probeFeishuCredentials: async () => ({
        message: "feishu credentials ready",
        ok: true,
      }),
      processManager: {
        start: async () => {
          startCalls.push("start");
          return {
            status: "ready",
            summary: "runtime ready",
          };
        },
      },
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(3);
    expect(startCalls).toEqual([]);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual({
      command: "onboard",
      reason: "invalid_workspace_path",
      status: "failed",
      summary: `workspacePath must be an existing directory: ${missingWorkspace}`,
    });

    await harness.cleanup();
  });

  test("未安装时 onboard 会明确指向 carvis install", async () => {
    const harness = await createCarvisCliHarness();
    const stdout: string[] = [];

    const exitCode = await runCarvisCli(["onboard"], {
      cwd: harness.workspacePath,
      env: {
        ...process.env,
        HOME: harness.homeDir,
      },
      onboardingPrompter: createScriptedPrompter({
        adapter: "feishu",
        allowFrom: "*",
        appId: "cli-app-id",
        appSecret: "cli-app-secret",
        requireMention: false,
        workspacePath: harness.workspacePath,
      }),
      probeFeishuCredentials: async () => ({
        message: "feishu credentials ready",
        ok: true,
      }),
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(4);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual({
      command: "onboard",
      reason: "not_installed",
      status: "failed",
      summary: "carvis install is required before onboard",
    });

    await harness.cleanup();
  });

  test("quickstart 修改已有配置并切换到新 root 时会重算 managedWorkspaceRoot", async () => {
    const harness = await createCarvisCliHarness();
    const originalWorkspace = join(harness.homeDir, "root-a", "workspace-main");
    const nextWorkspace = join(harness.homeDir, "root-b", "workspace-main");
    await mkdir(originalWorkspace, { recursive: true });
    await mkdir(nextWorkspace, { recursive: true });
    await mkdir(join(harness.homeDir, ".carvis"), { recursive: true });
    await Bun.write(
      harness.fileSet.configPath,
      JSON.stringify({
        agent: {
          id: "codex-main",
          bridge: "codex",
          defaultWorkspace: "main",
          timeoutSeconds: 5400,
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
            main: originalWorkspace,
          },
          chatBindings: {},
          sandboxModes: {
            main: "workspace-write",
          },
          managedWorkspaceRoot: join(harness.homeDir, "root-a"),
          templatePath: join(harness.homeDir, ".carvis", "templates", "default-workspace"),
        },
        triggers: {
          scheduledJobs: [],
          webhooks: [],
        },
      }),
    );
    await Bun.write(
      harness.fileSet.runtimeEnvPath,
      [
        "FEISHU_APP_ID=old-app-id",
        "FEISHU_APP_SECRET=old-app-secret",
        "POSTGRES_URL=postgres://carvis",
        "REDIS_URL=redis://carvis",
      ].join("\n"),
    );

    const exitCode = await runCarvisCli(["onboard"], {
      cwd: nextWorkspace,
      env: {
        ...process.env,
        HOME: harness.homeDir,
      },
      onboardingPrompter: createScriptedPrompter({
        allowFrom: "*",
        appId: "new-app-id",
        appSecret: "new-app-secret",
        existingConfigAction: "modify",
        requireMention: false,
        workspacePath: nextWorkspace,
      }),
      probeFeishuCredentials: async () => ({
        message: "feishu credentials ready",
        ok: true,
      }),
      processManager: {
        start: async () => ({
          status: "ready",
          summary: "runtime ready",
        }),
      },
    });

    expect(exitCode).toBe(0);
    const config = await loadRuntimeConfig({
      configPath: harness.fileSet.configPath,
      env: {
        ...process.env,
        HOME: harness.homeDir,
        FEISHU_APP_ID: "new-app-id",
        FEISHU_APP_SECRET: "new-app-secret",
        POSTGRES_URL: "postgres://carvis",
        REDIS_URL: "redis://carvis",
      },
    });
    expect(config.workspaceResolver.managedWorkspaceRoot).toBe(join(harness.homeDir, "root-b"));
    expect(config.agent.workspace).toBe(nextWorkspace);

    await harness.cleanup();
  });
});

function createScriptedPrompter(script: Partial<{
  adapter: string;
  allowFrom: string;
  appId: string;
  appSecret: string;
  existingConfigAction: string;
  requireMention: boolean;
  reuseExistingConfig: boolean;
  workspacePath: string;
}>) {
  return {
    async confirm(input: { id: string }) {
      if (input.id === "reuseExistingConfig") {
        return script.reuseExistingConfig ?? false;
      }
      if (input.id === "showFullFeishuGuide") {
        return false;
      }
      if (input.id === "requireMention") {
        return script.requireMention ?? false;
      }
      throw new Error(`unexpected confirm prompt: ${input.id}`);
    },
    async input(input: { id: string }) {
      switch (input.id) {
        case "appId":
          return script.appId ?? "";
        case "appSecret":
          return script.appSecret ?? "";
        case "allowFrom":
          return script.allowFrom ?? "*";
        case "workspacePath":
          return script.workspacePath ?? "";
        default:
          throw new Error(`unexpected input prompt: ${input.id}`);
      }
    },
    async select(input: { id: string }) {
      if (input.id === "adapter") {
        return script.adapter ?? "feishu";
      }
      if (input.id === "existingConfigAction") {
        return script.existingConfigAction ?? "reuse";
      }
      throw new Error(`unexpected select prompt: ${input.id}`);
    },
  };
}
