import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createCarvisStateStore,
  resolveCarvisRuntimeFileSet,
} from "../../packages/carvis-cli/src/state-store.ts";

describe("carvis cli state store", () => {
  test("读写 gateway / executor 本地状态", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-cli-state-"));
    const fileSet = resolveCarvisRuntimeFileSet({
      homeDir,
    });
    const store = createCarvisStateStore({
      fileSet,
      processExists: () => true,
    });

    await store.write({
      configFingerprint: "fingerprint-1",
      healthSnapshot: {
        config_fingerprint: "fingerprint-1",
        config_valid: true,
        feishu_ingress_ready: true,
        feishu_ready: true,
        http_listening: true,
        last_error: null,
        ready: true,
      },
      logPath: join(fileSet.logsDir, "gateway.log"),
      pid: 1234,
      role: "gateway",
      startedAt: "2026-03-15T10:00:00.000Z",
      status: "ready",
    });

    await store.write({
      configFingerprint: "fingerprint-1",
      logPath: join(fileSet.logsDir, "executor.log"),
      pid: 5678,
      role: "executor",
      startedAt: "2026-03-15T10:00:05.000Z",
      startupReport: {
        codexReady: true,
        configFingerprint: "fingerprint-1",
        consumerActive: true,
        postgresReady: true,
        redisReady: true,
        role: "executor",
        status: "ready",
      },
      status: "ready",
    });

    expect(await store.read("gateway")).toEqual({
      configFingerprint: "fingerprint-1",
      healthSnapshot: {
        config_fingerprint: "fingerprint-1",
        config_valid: true,
        feishu_ingress_ready: true,
        feishu_ready: true,
        http_listening: true,
        last_error: null,
        ready: true,
      },
      logPath: join(fileSet.logsDir, "gateway.log"),
      pid: 1234,
      role: "gateway",
      startedAt: "2026-03-15T10:00:00.000Z",
      status: "ready",
    });
    expect(await store.read("executor")).toEqual({
      configFingerprint: "fingerprint-1",
      logPath: join(fileSet.logsDir, "executor.log"),
      pid: 5678,
      role: "executor",
      startedAt: "2026-03-15T10:00:05.000Z",
      startupReport: {
        codexReady: true,
        configFingerprint: "fingerprint-1",
        consumerActive: true,
        postgresReady: true,
        redisReady: true,
        role: "executor",
        status: "ready",
      },
      status: "ready",
    });
  });

  test("cleanupStale 会删除已退出进程对应的状态文件", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-cli-state-"));
    const fileSet = resolveCarvisRuntimeFileSet({
      homeDir,
    });
    const store = createCarvisStateStore({
      fileSet,
      processExists: (pid) => pid === 5678,
    });

    await store.write({
      configFingerprint: "fingerprint-gateway",
      logPath: join(fileSet.logsDir, "gateway.log"),
      pid: 1234,
      role: "gateway",
      startedAt: "2026-03-15T10:00:00.000Z",
      status: "starting",
    });
    await store.write({
      configFingerprint: "fingerprint-executor",
      logPath: join(fileSet.logsDir, "executor.log"),
      pid: 5678,
      role: "executor",
      startedAt: "2026-03-15T10:00:05.000Z",
      status: "starting",
    });

    const removed = await store.cleanupStale();

    expect(removed).toEqual(["gateway"]);
    expect(await store.read("gateway")).toBeNull();
    expect(await store.read("executor")).toEqual({
      configFingerprint: "fingerprint-executor",
      logPath: join(fileSet.logsDir, "executor.log"),
      pid: 5678,
      role: "executor",
      startedAt: "2026-03-15T10:00:05.000Z",
      status: "starting",
    });
  });

  test("clear 会清空指定角色的状态文件", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-cli-state-"));
    const fileSet = resolveCarvisRuntimeFileSet({
      homeDir,
    });
    const store = createCarvisStateStore({
      fileSet,
      processExists: () => true,
    });

    await store.write({
      configFingerprint: "fingerprint-1",
      logPath: join(fileSet.logsDir, "gateway.log"),
      pid: 1234,
      role: "gateway",
      startedAt: "2026-03-15T10:00:00.000Z",
      status: "ready",
    });

    await store.clear("gateway");

    expect(await store.read("gateway")).toBeNull();
    await expect(readFile(join(fileSet.stateDir, "gateway.json"), "utf8")).rejects.toThrow();
  });
});
