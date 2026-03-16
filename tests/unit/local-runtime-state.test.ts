import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  clearLocalRuntimeProcessState,
  createLocalRuntimeStateSink,
  readLocalRuntimeProcessState,
} from "../../packages/core/src/runtime/local-runtime-state.ts";

describe("local runtime state", () => {
  test("gateway sink 会把 health 摘要写到本地状态文件", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "carvis-local-runtime-state-"));
    const sink = createLocalRuntimeStateSink({
      logPath: join(stateDir, "gateway.log"),
      pid: 1201,
      role: "gateway",
      startedAt: "2026-03-15T08:00:00.000Z",
      stateDir,
    });

    await sink.writeGatewayState({
      snapshot: {
        ok: true,
        state: {
          config_fingerprint: "gateway-fingerprint",
          config_valid: true,
          feishu_ingress_ready: true,
          feishu_ready: true,
          http_listening: true,
          last_error: null,
          ready: true,
        },
      },
      status: "ready",
    });

    expect(await readLocalRuntimeProcessState(stateDir, "gateway")).toEqual({
      configFingerprint: "gateway-fingerprint",
      healthSnapshot: {
        config_fingerprint: "gateway-fingerprint",
        config_valid: true,
        feishu_ingress_ready: true,
        feishu_ready: true,
        http_listening: true,
        last_error: null,
        ready: true,
      },
      logPath: join(stateDir, "gateway.log"),
      pid: 1201,
      role: "gateway",
      startedAt: "2026-03-15T08:00:00.000Z",
      status: "ready",
    });
  });

  test("executor sink 会把 startup report 和错误落盘", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "carvis-local-runtime-state-"));
    const sink = createLocalRuntimeStateSink({
      logPath: join(stateDir, "executor.log"),
      pid: 2201,
      role: "executor",
      startedAt: "2026-03-15T08:00:00.000Z",
      stateDir,
    });

    await sink.writeExecutorState({
      startupReport: {
        codexReady: false,
        configFingerprint: "executor-fingerprint",
        consumerActive: false,
        errorCode: "CODEX_UNAVAILABLE",
        errorMessage: "codex unavailable: spawn ENOENT",
        postgresReady: true,
        redisReady: true,
        role: "executor",
        status: "failed",
      },
    });

    const persisted = JSON.parse(
      await readFile(join(stateDir, "executor.json"), "utf8"),
    ) as {
      lastErrorCode: string;
      lastErrorMessage: string;
    };

    expect(persisted.lastErrorCode).toBe("CODEX_UNAVAILABLE");
    expect(persisted.lastErrorMessage).toBe("codex unavailable: spawn ENOENT");
    expect(await readLocalRuntimeProcessState(stateDir, "executor")).toEqual({
      configFingerprint: "executor-fingerprint",
      lastErrorCode: "CODEX_UNAVAILABLE",
      lastErrorMessage: "codex unavailable: spawn ENOENT",
      logPath: join(stateDir, "executor.log"),
      pid: 2201,
      role: "executor",
      startedAt: "2026-03-15T08:00:00.000Z",
      startupReport: {
        codexReady: false,
        configFingerprint: "executor-fingerprint",
        consumerActive: false,
        errorCode: "CODEX_UNAVAILABLE",
        errorMessage: "codex unavailable: spawn ENOENT",
        postgresReady: true,
        redisReady: true,
        role: "executor",
        status: "failed",
      },
      status: "failed",
    });
  });

  test("clear 会移除指定角色的状态文件", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "carvis-local-runtime-state-"));
    const sink = createLocalRuntimeStateSink({
      logPath: join(stateDir, "gateway.log"),
      pid: 1201,
      role: "gateway",
      startedAt: "2026-03-15T08:00:00.000Z",
      stateDir,
    });

    await sink.writeGatewayState({
      snapshot: {
        ok: true,
        state: {
          config_fingerprint: "gateway-fingerprint",
          config_valid: true,
          feishu_ingress_ready: false,
          feishu_ready: true,
          http_listening: true,
          last_error: null,
          ready: false,
        },
      },
      status: "starting",
    });

    await clearLocalRuntimeProcessState(stateDir, "gateway");

    expect(await readLocalRuntimeProcessState(stateDir, "gateway")).toBeNull();
  });
});
