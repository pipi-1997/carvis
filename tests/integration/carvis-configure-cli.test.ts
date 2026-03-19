import { describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { runCarvisCli } from "../../packages/carvis-cli/src/index.ts";
import { resolveCarvisRuntimeFileSet, writeCarvisRuntimeConfig } from "../../packages/carvis-cli/src/config-writer.ts";
import { createCarvisCliHarness } from "../support/carvis-cli-harness.ts";

describe("carvis configure cli", () => {
  test("局部重配 feishu 与 workspace 不要求重走完整 onboarding", async () => {
    const harness = await createCarvisCliHarness();
    const fileSet = resolveCarvisRuntimeFileSet({ homeDir: harness.homeDir });
    const nextWorkspace = join(harness.homeDir, "workspace-feature");
    await mkdir(nextWorkspace, { recursive: true });

    await writeCarvisRuntimeConfig(
      {
        adapter: "feishu",
        allowFrom: ["chat-a"],
        feishuAppId: "app-id",
        feishuAppSecret: "app-secret",
        requireMention: false,
        workspacePath: harness.workspacePath,
      },
      { fileSet },
    );

    const feishuExitCode = await runCarvisCli(["configure", "feishu"], {
      env: { HOME: harness.homeDir },
      probeFeishuCredentials: async () => ({ message: "ready", ok: true }),
      configurePrompter: {
        async confirm(input) {
          if (input.id === "showFullFeishuGuide") {
            return false;
          }
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
              return "chat-b";
            default:
              throw new Error(`unexpected input prompt: ${input.id}`);
          }
        },
        async select() {
          throw new Error("unexpected select prompt");
        },
      },
    });

    const workspaceExitCode = await runCarvisCli(["configure", "workspace"], {
      env: { HOME: harness.homeDir },
      configurePrompter: {
        async confirm() {
          throw new Error("unexpected confirm prompt");
        },
        async input(input) {
          switch (input.id) {
            case "workspaceKey":
              return "feature-a";
            case "workspacePath":
              return nextWorkspace;
            case "managedWorkspaceRoot":
              return harness.homeDir;
            case "templatePath":
              return join(harness.homeDir, ".carvis", "templates", "default-workspace");
            default:
              throw new Error(`unexpected input prompt: ${input.id}`);
          }
        },
        async select() {
          throw new Error("unexpected select prompt");
        },
      },
    });

    expect(feishuExitCode).toBe(0);
    expect(workspaceExitCode).toBe(0);
    expect(await Bun.file(fileSet.runtimeEnvPath).text()).toContain("FEISHU_APP_ID=new-app-id");
    expect(await Bun.file(fileSet.configPath).text()).toContain("\"defaultWorkspace\": \"feature-a\"");

    await harness.cleanup();
  });
});
