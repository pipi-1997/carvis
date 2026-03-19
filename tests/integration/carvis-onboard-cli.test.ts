import { describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { runCarvisCli } from "../../packages/carvis-cli/src/index.ts";
import { createCarvisCliHarness } from "../support/carvis-cli-harness.ts";

describe("carvis onboard cli", () => {
  test("onboard -> start 的最小闭环会写配置并收敛到 ready", async () => {
    const harness = await createCarvisCliHarness();
    await mkdir(join(harness.homeDir, ".carvis"), { recursive: true });
    await Bun.write(
      join(harness.homeDir, ".carvis", "install-manifest.json"),
      JSON.stringify({
        status: "installed",
      }),
    );

    const exitCode = await runCarvisCli(["onboard"], {
      cwd: harness.workspacePath,
      env: {
        ...process.env,
        HOME: harness.homeDir,
      },
      onboardingPrompter: {
        async confirm(input) {
          if (input.id === "showFullFeishuGuide") {
            return false;
          }
          if (input.id === "requireMention") {
            return false;
          }
          throw new Error(`unexpected confirm prompt: ${input.id}`);
        },
        async input(input) {
          switch (input.id) {
            case "appId":
              return "cli-app-id";
            case "appSecret":
              return "cli-app-secret";
            case "allowFrom":
              return "*";
            case "workspacePath":
              return harness.workspacePath;
            default:
              throw new Error(`unexpected input prompt: ${input.id}`);
          }
        },
        async select() {
          return "feishu";
        },
      },
      probeFeishuCredentials: async () => ({
        message: "feishu credentials ready",
        ok: true,
      }),
      daemonCommandService: {
        run: async () => ({
          operation: "start",
          status: "ready",
          summary: "runtime ready",
        }),
      },
    });

    expect(exitCode).toBe(0);
    expect(await Bun.file(harness.fileSet.configPath).text()).toContain("\"allowFrom\": [");
    expect(await Bun.file(harness.fileSet.configPath).text()).toContain("\"defaultWorkspace\": \"main\"");

    await harness.cleanup();
  });
});
