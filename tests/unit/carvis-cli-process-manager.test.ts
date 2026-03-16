import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createProcessManager } from "../../packages/carvis-cli/src/process-manager.ts";
import { resolveCarvisRuntimeFileSet, writeCarvisRuntimeConfig } from "../../packages/carvis-cli/src/config-writer.ts";
import { createCarvisStateStore } from "../../packages/carvis-cli/src/state-store.ts";

describe("carvis cli process manager", () => {
  test("先等待 gateway ready，再启动 executor", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-process-manager-"));
    const workspacePath = join(homeDir, "workspace-main");
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
        postgresUrl: "postgres://carvis",
        redisUrl: "redis://carvis",
        requireMention: false,
        workspacePath,
      },
      {
        fileSet,
      },
    );

    const stateStore = createCarvisStateStore({
      fileSet,
      processExists: () => true,
    });
    const spawnCalls: string[] = [];
    let gatewayReady = false;

    const manager = createProcessManager({
      env: {
        HOME: homeDir,
      },
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
        spawnCalls.push(input.role);
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
      stateStore,
    });

    const result = await manager.start();

    expect(spawnCalls).toEqual(["gateway", "executor"]);
    expect(result.status).toBe("ready");
    expect(result.executor?.status).toBe("ready");
  });

  test("executor startup report failed 时会回滚已启动进程", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-process-manager-"));
    const workspacePath = join(homeDir, "workspace-main");
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
        postgresUrl: "postgres://carvis",
        redisUrl: "redis://carvis",
        requireMention: false,
        workspacePath,
      },
      {
        fileSet,
      },
    );

    const stateStore = createCarvisStateStore({
      fileSet,
      processExists: () => true,
    });
    const stopCalls: string[] = [];

    const manager = createProcessManager({
      env: {
        HOME: homeDir,
      },
      executorReadyTimeoutMs: 20,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            ok: true,
            state: {
              ready: true,
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
        if (input.role === "executor") {
          void stateStore.write({
            configFingerprint: "fingerprint-001",
            lastErrorCode: "CODEX_UNAVAILABLE",
            lastErrorMessage: "codex unavailable",
            logPath: input.logPath,
            pid: 2202,
            role: "executor",
            startedAt: "2026-03-15T10:00:00.000Z",
            startupReport: {
              codexReady: false,
              configFingerprint: "fingerprint-001",
              consumerActive: false,
              errorCode: "CODEX_UNAVAILABLE",
              errorMessage: "codex unavailable",
              postgresReady: true,
              redisReady: true,
              role: "executor",
              status: "failed",
            },
            status: "failed",
          });
        }
        return Promise.resolve({
          pid: input.role === "gateway" ? 1201 : 2202,
          stop: async () => {
            stopCalls.push(input.role);
          },
        });
      },
      stateStore,
    });

    const result = await manager.start();

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("CODEX_UNAVAILABLE");
    expect(stopCalls).toEqual(["executor", "gateway"]);
  });
});
