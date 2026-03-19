import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runConfigure } from "../../packages/carvis-cli/src/configure.ts";
import { resolveCarvisRuntimeFileSet, writeCarvisRuntimeConfig } from "../../packages/carvis-cli/src/config-writer.ts";

describe("carvis cli configure", () => {
  test("configure feishu 会更新 env 和结构化配置", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-configure-"));
    const workspacePath = join(homeDir, "workspace-main");
    await mkdir(workspacePath, { recursive: true });
    const fileSet = resolveCarvisRuntimeFileSet({ homeDir });

    await writeCarvisRuntimeConfig(
      {
        adapter: "feishu",
        allowFrom: ["chat-a"],
        feishuAppId: "old-app-id",
        feishuAppSecret: "old-app-secret",
        requireMention: false,
        workspacePath,
      },
      { fileSet },
    );

    const result = await runConfigure("feishu", {
      env: { HOME: homeDir },
      probeFeishuCredentials: async () => ({ message: "ready", ok: true }),
      prompter: {
        async confirm(input) {
          if (input.id === "requireMention") {
            return true;
          }
          throw new Error(`unexpected confirm prompt: ${input.id}`);
        },
        async input(input) {
          switch (input.id) {
            case "appId":
              return "new-app-id";
            case "appSecret":
              return "new-app-secret";
            case "allowFrom":
              return "chat-b,chat-c";
            default:
              throw new Error(`unexpected input prompt: ${input.id}`);
          }
        },
        async select() {
          throw new Error("unexpected select prompt");
        },
      },
    });

    expect(result.status).toBe("updated");
    expect(await Bun.file(fileSet.runtimeEnvPath).text()).toContain("FEISHU_APP_ID=new-app-id");
    expect(await Bun.file(fileSet.configPath).text()).toContain("\"requireMention\": true");
    expect(await Bun.file(fileSet.configPath).text()).toContain("\"chat-b\"");
  });

  test("configure feishu 默认展示字段级提示，而不是整套完整引导", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-configure-"));
    const workspacePath = join(homeDir, "workspace-main");
    await mkdir(workspacePath, { recursive: true });
    const fileSet = resolveCarvisRuntimeFileSet({ homeDir });
    const notes: Array<{ message: string; title?: string }> = [];

    await writeCarvisRuntimeConfig(
      {
        adapter: "feishu",
        allowFrom: ["chat-a"],
        feishuAppId: "old-app-id",
        feishuAppSecret: "old-app-secret",
        requireMention: false,
        workspacePath,
      },
      { fileSet },
    );

    const result = await runConfigure("feishu", {
      env: { HOME: homeDir },
      probeFeishuCredentials: async () => ({ message: "ready", ok: true }),
      prompter: {
        async confirm(input) {
          if (input.id === "requireMention") {
            return false;
          }
          throw new Error(`unexpected confirm prompt: ${input.id}`);
        },
        async input(input) {
          switch (input.id) {
            case "appId":
              return "new-app-id";
            case "appSecret":
              return "new-app-secret";
            case "allowFrom":
              return "chat-b";
            default:
              throw new Error(`unexpected input prompt: ${input.id}`);
          }
        },
        note(message, title) {
          notes.push({ message, title });
        },
        async select() {
          throw new Error("unexpected select prompt");
        },
      },
    });

    expect(result.status).toBe("updated");
    expect(notes.some((note) => note.title?.includes("Feishu App ID"))).toBe(true);
    expect(notes.some((note) => note.message.includes("App Secret"))).toBe(true);
    expect(notes.some((note) => note.title?.includes("Allowlist"))).toBe(true);
    expect(notes.some((note) => note.message.includes("@ 机器人"))).toBe(true);
    expect(notes.some((note) => note.title?.includes("飞书接入准备"))).toBe(false);
    expect(notes.some((note) => note.message.includes("事件接收使用 websocket"))).toBe(false);
  });

  test("configure workspace 会更新 default workspace 路径", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-configure-"));
    const workspacePath = join(homeDir, "workspace-main");
    const workspacePath2 = join(homeDir, "workspace-feature");
    await mkdir(workspacePath, { recursive: true });
    await mkdir(workspacePath2, { recursive: true });
    const fileSet = resolveCarvisRuntimeFileSet({ homeDir });

    await writeCarvisRuntimeConfig(
      {
        adapter: "feishu",
        allowFrom: ["chat-a"],
        feishuAppId: "app-id",
        feishuAppSecret: "app-secret",
        requireMention: false,
        workspacePath,
      },
      { fileSet },
    );

    const result = await runConfigure("workspace", {
      env: { HOME: homeDir },
      prompter: {
        async confirm() {
          throw new Error("unexpected confirm prompt");
        },
        async input(input) {
          switch (input.id) {
            case "workspaceKey":
              return "feature-a";
            case "workspacePath":
              return workspacePath2;
            case "managedWorkspaceRoot":
              return homeDir;
            case "templatePath":
              return join(homeDir, ".carvis", "templates", "default-workspace");
            default:
              throw new Error(`unexpected input prompt: ${input.id}`);
          }
        },
        async select() {
          throw new Error("unexpected select prompt");
        },
      },
    });

    expect(result.status).toBe("updated");
    expect(await Bun.file(fileSet.configPath).text()).toContain("\"defaultWorkspace\": \"feature-a\"");
    expect(await Bun.file(fileSet.configPath).text()).toContain(workspacePath2);
  });

  test("configure feishu 遇到空白 allowFrom 会拒绝写入非法配置", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-configure-"));
    const workspacePath = join(homeDir, "workspace-main");
    await mkdir(workspacePath, { recursive: true });
    const fileSet = resolveCarvisRuntimeFileSet({ homeDir });

    await writeCarvisRuntimeConfig(
      {
        adapter: "feishu",
        allowFrom: ["chat-a"],
        feishuAppId: "old-app-id",
        feishuAppSecret: "old-app-secret",
        requireMention: false,
        workspacePath,
      },
      { fileSet },
    );

    const beforeConfig = await Bun.file(fileSet.configPath).text();
    const result = await runConfigure("feishu", {
      env: { HOME: homeDir },
      probeFeishuCredentials: async () => ({ message: "ready", ok: true }),
      prompter: {
        async confirm(input) {
          if (input.id === "requireMention") {
            return false;
          }
          throw new Error(`unexpected confirm prompt: ${input.id}`);
        },
        async input(input) {
          switch (input.id) {
            case "appId":
              return "new-app-id";
            case "appSecret":
              return "new-app-secret";
            case "allowFrom":
              return "   ";
            default:
              throw new Error(`unexpected input prompt: ${input.id}`);
          }
        },
        async select() {
          throw new Error("unexpected select prompt");
        },
      },
    });

    expect(result).toEqual({
      reason: "invalid_feishu_setup",
      section: "feishu",
      status: "failed",
      summary: "allowFrom 至少需要一个 chat_id 或 *",
    });
    expect(await Bun.file(fileSet.configPath).text()).toBe(beforeConfig);
  });

  test("configure workspace 遇到不存在的路径时返回结构化失败而不是抛异常", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-configure-"));
    const workspacePath = join(homeDir, "workspace-main");
    await mkdir(workspacePath, { recursive: true });
    const fileSet = resolveCarvisRuntimeFileSet({ homeDir });

    await writeCarvisRuntimeConfig(
      {
        adapter: "feishu",
        allowFrom: ["chat-a"],
        feishuAppId: "app-id",
        feishuAppSecret: "app-secret",
        requireMention: false,
        workspacePath,
      },
      { fileSet },
    );

    const result = await runConfigure("workspace", {
      env: { HOME: homeDir },
      prompter: {
        async confirm() {
          throw new Error("unexpected confirm prompt");
        },
        async input(input) {
          switch (input.id) {
            case "workspaceKey":
              return "feature-a";
            case "workspacePath":
              return join(homeDir, "missing-workspace");
            case "managedWorkspaceRoot":
              return homeDir;
            case "templatePath":
              return join(homeDir, ".carvis", "templates", "default-workspace");
            default:
              throw new Error(`unexpected input prompt: ${input.id}`);
          }
        },
        async select() {
          throw new Error("unexpected select prompt");
        },
      },
    });

    expect(result).toEqual({
      reason: "invalid_workspace_path",
      section: "workspace",
      status: "failed",
      summary: `workspacePath must be an existing directory: ${join(homeDir, "missing-workspace")}`,
    });
  });
});
