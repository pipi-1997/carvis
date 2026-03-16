import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  resolveCarvisRuntimeFileSet,
  writeCarvisRuntimeConfig,
  type OnboardConfigDraft,
} from "../../packages/carvis-cli/src/config-writer.ts";

describe("carvis cli config writer", () => {
  test("按默认值推断并拆分 config.json 与 runtime.env", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-cli-config-"));
    const workspacePath = join(homeDir, "workspace-main");
    await mkdir(workspacePath, { recursive: true });

    const fileSet = resolveCarvisRuntimeFileSet({
      homeDir,
    });
    const draft: OnboardConfigDraft = {
      adapter: "feishu",
      allowFrom: ["chat-a", "chat-b"],
      feishuAppId: "cli-app-id",
      feishuAppSecret: "cli-app-secret",
      postgresUrl: "postgres://carvis:carvis@127.0.0.1:5432/carvis",
      redisUrl: "redis://127.0.0.1:6379/0",
      requireMention: false,
      workspacePath,
    };

    await writeCarvisRuntimeConfig(draft, {
      fileSet,
    });

    const configText = await readFile(fileSet.configPath, "utf8");
    const runtimeEnvText = await readFile(fileSet.runtimeEnvPath, "utf8");
    const parsedConfig = JSON.parse(configText) as {
      agent: { timeoutSeconds: number; maxConcurrent: number; defaultWorkspace: string };
      gateway: { port: number; healthPath: string };
      executor: { pollIntervalMs: number };
      feishu: { allowFrom: string[]; requireMention: boolean };
      workspaceResolver: {
        registry: Record<string, string>;
        sandboxModes: Record<string, string>;
        managedWorkspaceRoot: string;
        templatePath: string;
      };
    };

    expect(parsedConfig.agent.defaultWorkspace).toBe("main");
    expect(parsedConfig.agent.timeoutSeconds).toBe(5400);
    expect(parsedConfig.agent.maxConcurrent).toBe(1);
    expect(parsedConfig.gateway).toEqual({
      healthPath: "/healthz",
      port: 8787,
    });
    expect(parsedConfig.executor.pollIntervalMs).toBe(1000);
    expect(parsedConfig.feishu).toEqual({
      allowFrom: ["chat-a", "chat-b"],
      requireMention: false,
    });
    expect(parsedConfig.workspaceResolver.registry.main).toBe(workspacePath);
    expect(parsedConfig.workspaceResolver.sandboxModes.main).toBe("workspace-write");
    expect(parsedConfig.workspaceResolver.managedWorkspaceRoot).toBe(dirname(workspacePath));
    expect(parsedConfig.workspaceResolver.templatePath).toBe(fileSet.templateDir);
    expect(runtimeEnvText).toContain("FEISHU_APP_ID=cli-app-id");
    expect(runtimeEnvText).toContain("FEISHU_APP_SECRET=cli-app-secret");
    expect(runtimeEnvText).toContain("POSTGRES_URL=postgres://carvis:carvis@127.0.0.1:5432/carvis");
    expect(runtimeEnvText).toContain("REDIS_URL=redis://127.0.0.1:6379/0");
    expect(configText).not.toContain("cli-app-secret");
    expect(configText).not.toContain("postgres://carvis:carvis@127.0.0.1:5432/carvis");
  });

  test("允许显式覆盖 workspaceKey、managedWorkspaceRoot 和 templatePath", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-cli-config-"));
    const managedWorkspaceRoot = join(homeDir, "managed");
    const workspacePath = join(managedWorkspaceRoot, "custom-workspace");
    await mkdir(workspacePath, { recursive: true });

    const fileSet = resolveCarvisRuntimeFileSet({
      homeDir,
    });

    await writeCarvisRuntimeConfig(
      {
        adapter: "feishu",
        allowFrom: ["*"],
        feishuAppId: "app-id",
        feishuAppSecret: "app-secret",
        managedWorkspaceRoot,
        postgresUrl: "postgres://custom",
        redisUrl: "redis://custom",
        requireMention: true,
        templatePath: join(homeDir, "templates", "custom"),
        workspaceKey: "feature-a",
        workspacePath,
      },
      {
        fileSet,
      },
    );

    const parsedConfig = JSON.parse(await readFile(fileSet.configPath, "utf8")) as {
      agent: { defaultWorkspace: string };
      feishu: { requireMention: boolean };
      workspaceResolver: {
        registry: Record<string, string>;
        managedWorkspaceRoot: string;
        templatePath: string;
      };
    };

    expect(parsedConfig.agent.defaultWorkspace).toBe("feature-a");
    expect(parsedConfig.feishu.requireMention).toBe(true);
    expect(parsedConfig.workspaceResolver.registry["feature-a"]).toBe(workspacePath);
    expect(parsedConfig.workspaceResolver.managedWorkspaceRoot).toBe(managedWorkspaceRoot);
    expect(parsedConfig.workspaceResolver.templatePath).toBe(join(homeDir, "templates", "custom"));
  });

  test("显式传入不包含 workspace 的 managedWorkspaceRoot 时拒绝写入", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-cli-config-"));
    const workspacePath = join(homeDir, "custom-workspace");
    await mkdir(workspacePath, { recursive: true });

    const fileSet = resolveCarvisRuntimeFileSet({
      homeDir,
    });

    await expect(
      writeCarvisRuntimeConfig(
        {
          adapter: "feishu",
          allowFrom: ["*"],
          feishuAppId: "app-id",
          feishuAppSecret: "app-secret",
          managedWorkspaceRoot: join(homeDir, "managed"),
          postgresUrl: "postgres://custom",
          redisUrl: "redis://custom",
          requireMention: true,
          templatePath: join(homeDir, "templates", "custom"),
          workspaceKey: "feature-a",
          workspacePath,
        },
        {
          fileSet,
        },
      ),
    ).rejects.toThrow("workspaceResolver.registry.feature-a must stay within managedWorkspaceRoot");
  });
});
