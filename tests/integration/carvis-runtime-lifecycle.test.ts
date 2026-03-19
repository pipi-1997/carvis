import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCarvisCli } from "../../packages/carvis-cli/src/index.ts";
import { resolveCarvisRuntimeFileSet, writeCarvisRuntimeConfig } from "../../packages/carvis-cli/src/config-writer.ts";
import { createCarvisStateStore } from "../../packages/carvis-cli/src/state-store.ts";
import { createStatusService } from "../../packages/carvis-cli/src/status.ts";

describe("carvis runtime lifecycle", () => {
  test("start/status/stop 形成稳定本地运维路径", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-runtime-lifecycle-"));
    const workspacePath = join(homeDir, "workspace-main");
    await mkdir(workspacePath, { recursive: true });
    const fileSet = resolveCarvisRuntimeFileSet({ homeDir });
    const stateStore = createCarvisStateStore({
      fileSet,
      processExists: (pid) => pid !== 2202,
    });
    let gatewayReady = false;

    await writeCarvisRuntimeConfig(
      {
        adapter: "feishu",
        allowFrom: ["*"],
        feishuAppId: "app-id",
        feishuAppSecret: "app-secret",
        requireMention: false,
        workspacePath,
      },
      {
        existingRuntimeEnv: {
          POSTGRES_URL: "postgres://carvis",
          REDIS_URL: "redis://carvis",
        },
        fileSet,
      },
    );

    const startExitCode = await runCarvisCli(["start"], {
      env: { HOME: homeDir },
      processManagerOptions: {
        executorReadyTimeoutMs: 20,
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              ok: true,
              state: {
                last_error: gatewayReady
                  ? null
                  : {
                      code: "FEISHU_WS_DISCONNECTED",
                    },
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
            void stateStore.write({
              configFingerprint: "fingerprint-001",
              healthSnapshot: {
                config_fingerprint: "fingerprint-001",
                config_valid: true,
                feishu_ingress_ready: true,
                feishu_ready: true,
                http_listening: true,
                last_error: null,
                ready: true,
              },
              logPath: input.logPath,
              pid: 1201,
              role: "gateway",
              startedAt: "2026-03-15T10:00:00.000Z",
              status: "ready",
            });
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
            stop: async () => {
              await stateStore.clear(input.role);
            },
          });
        },
        stateStore,
      },
    });

    expect(startExitCode).toBe(0);

    const statusStdout: string[] = [];
    const statusExitCode = await runCarvisCli(["status"], {
      env: { HOME: homeDir },
      statusService: createStatusService({
        env: { HOME: homeDir },
        processExists: () => true,
        stateStore: createCarvisStateStore({
          fileSet,
          processExists: () => true,
        }),
      }),
      stdout(text) {
        statusStdout.push(text);
      },
    });

    expect(statusExitCode).toBe(0);
    expect(JSON.parse(statusStdout.at(-1) ?? "null")).toEqual(
      expect.objectContaining({
        command: "status",
        overallStatus: "ready",
      }),
    );

    const stopExitCode = await runCarvisCli(["stop"], {
      env: { HOME: homeDir },
      processManagerOptions: {
        processExists: (pid) => pid === 1201,
        sleep: async () => {},
        stateStore,
      },
    });

    expect(stopExitCode).toBe(0);
    expect(await stateStore.read("gateway")).toBeNull();
    expect(await stateStore.read("executor")).toBeNull();
  });

  test("重复 start 会阻止多实例，stale state 会先清理", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-runtime-lifecycle-"));
    const workspacePath = join(homeDir, "workspace-main");
    await mkdir(workspacePath, { recursive: true });
    const fileSet = resolveCarvisRuntimeFileSet({ homeDir });
    const stateStore = createCarvisStateStore({
      fileSet,
      processExists: (pid) => pid === 1201,
    });

    await writeCarvisRuntimeConfig(
      {
        adapter: "feishu",
        allowFrom: ["*"],
        feishuAppId: "app-id",
        feishuAppSecret: "app-secret",
        requireMention: false,
        workspacePath,
      },
      {
        existingRuntimeEnv: {
          POSTGRES_URL: "postgres://carvis",
          REDIS_URL: "redis://carvis",
        },
        fileSet,
      },
    );
    await stateStore.write({
      configFingerprint: "fingerprint-001",
      logPath: join(fileSet.logsDir, "gateway.log"),
      pid: 9998,
      role: "gateway",
      startedAt: "2026-03-15T09:00:00.000Z",
      status: "starting",
    });
    await stateStore.write({
      configFingerprint: "fingerprint-001",
      logPath: join(fileSet.logsDir, "executor.log"),
      pid: 1201,
      role: "executor",
      startedAt: "2026-03-15T09:00:00.000Z",
      status: "starting",
    });

    const stdout: string[] = [];
    const exitCode = await runCarvisCli(["start"], {
      env: { HOME: homeDir },
      processManagerOptions: {
        fetchImpl: async () =>
          new Response(JSON.stringify({ ok: true, state: { ready: true } }), {
            headers: { "content-type": "application/json" },
          }),
        sleep: async () => {},
        spawn: async () => ({
          pid: 1301,
          stop: async () => {},
        }),
        stateStore,
      },
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(4);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual(
      expect.objectContaining({
        command: "start",
        reason: "ALREADY_RUNNING",
        status: "failed",
      }),
    );
    expect(await stateStore.read("gateway")).toBeNull();
    expect(await stateStore.read("executor")).not.toBeNull();
  });
});
