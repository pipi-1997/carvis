import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { runCarvisCli } from "../../packages/carvis-cli/src/index.ts";
import { createCarvisStateStore } from "../../packages/carvis-cli/src/state-store.ts";
import { createCarvisCliHarness } from "../support/carvis-cli-harness.ts";

describe("carvis onboard cli", () => {
  test("onboard -> start 的最小闭环会写配置并收敛到 ready", async () => {
    const harness = await createCarvisCliHarness();
    const stateStore = createCarvisStateStore({
      fileSet: harness.fileSet,
      processExists: () => true,
    });
    let gatewayReady = false;

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
            case "postgresUrl":
              return "postgres://carvis";
            case "redisUrl":
              return "redis://carvis";
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
      processManagerOptions: {
        executorReadyTimeoutMs: 20,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              ok: true,
              state: {
                ready: gatewayReady,
              },
            }),
            {
              headers: {
                "content-type": "application/json",
              },
            },
          ),
        gatewayReadyTimeoutMs: 20,
        sleep: async () => {},
        spawn(input) {
          if (input.role === "gateway") {
            gatewayReady = true;
          }
          if (input.role === "executor") {
            void stateStore.write({
              configFingerprint: "fingerprint-001",
              logPath: input.logPath,
              pid: 2202,
              role: "executor",
              startedAt: "2026-03-15T10:00:00.000Z",
              startupReport: {
                codexReady: true,
                configFingerprint: "fingerprint-001",
                consumerActive: true,
                postgresReady: true,
                redisReady: true,
                role: "executor",
                status: "ready",
              },
              status: "ready",
            });
          }
          return Promise.resolve({
            pid: input.role === "gateway" ? 1201 : 2202,
            stop: async () => {},
          });
        },
      },
    });

    expect(exitCode).toBe(0);
    expect(await Bun.file(harness.fileSet.configPath).text()).toContain("\"allowFrom\": [");
    expect(await Bun.file(join(harness.fileSet.stateDir, "executor.json")).text()).toContain("\"status\": \"ready\"");

    await harness.cleanup();
  });
});
