import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createStatusService, summarizeRuntimeStatus } from "../../packages/carvis-cli/src/status.ts";
import { DockerDaemonUnavailableError } from "../../packages/carvis-cli/src/docker-engine.ts";
import { createRuntimeHarness } from "../support/runtime-harness.ts";

describe("carvis cli status", () => {
  test("gateway health ready 且 executor ready 时汇总为 ready", () => {
    const summary = summarizeRuntimeStatus({
      executorState: {
        configFingerprint: "fingerprint-001",
        logPath: "/tmp/executor.log",
        pid: 2201,
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
      },
      gatewayState: {
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
        logPath: "/tmp/gateway.log",
        pid: 1201,
        role: "gateway",
        startedAt: "2026-03-15T10:00:00.000Z",
        status: "ready",
      },
    });

    expect(summary.overallStatus).toBe("ready");
    expect(summary.gateway.alive).toBe(true);
    expect(summary.executor.alive).toBe(true);
  });

  test("只有 pid 存活但 gateway 未 ready 时汇总为 starting", () => {
    const summary = summarizeRuntimeStatus({
      executorState: null,
      gatewayState: {
        configFingerprint: "fingerprint-001",
        healthSnapshot: {
          config_fingerprint: "fingerprint-001",
          config_valid: true,
          feishu_ingress_ready: false,
          feishu_ready: true,
          http_listening: true,
          last_error: null,
          ready: false,
        },
        logPath: "/tmp/gateway.log",
        pid: 1201,
        role: "gateway",
        startedAt: "2026-03-15T10:00:00.000Z",
        status: "starting",
      },
    });

    expect(summary.overallStatus).toBe("starting");
    expect(summary.gateway.alive).toBe(true);
    expect(summary.executor.alive).toBe(false);
  });

  test("命名错误会保留 degraded 或 failed 语义", () => {
    const summary = summarizeRuntimeStatus({
      executorState: {
        configFingerprint: "fingerprint-001",
        lastErrorCode: "CODEX_UNAVAILABLE",
        lastErrorMessage: "codex unavailable",
        logPath: "/tmp/executor.log",
        pid: 2201,
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
      },
      gatewayState: {
        configFingerprint: "fingerprint-001",
        healthSnapshot: {
          config_fingerprint: "fingerprint-001",
          config_valid: true,
          feishu_ingress_ready: false,
          feishu_ready: true,
          http_listening: true,
          last_error: {
            code: "FEISHU_WS_DISCONNECTED",
            message: "websocket disconnected",
          },
          ready: false,
        },
        lastErrorCode: "FEISHU_WS_DISCONNECTED",
        lastErrorMessage: "websocket disconnected",
        logPath: "/tmp/gateway.log",
        pid: 1201,
        role: "gateway",
        startedAt: "2026-03-15T10:00:00.000Z",
        status: "degraded",
      },
    });

    expect(summary.overallStatus).toBe("failed");
    expect(summary.gateway.lastErrorCode).toBe("FEISHU_WS_DISCONNECTED");
    expect(summary.executor.lastErrorCode).toBe("CODEX_UNAVAILABLE");
  });

  test("status 会主动探测 external dependency，而不只是判断是否已配置", async () => {
    const harness = await createRuntimeHarness({
      env: {
        FEISHU_APP_ID: "",
        FEISHU_APP_SECRET: "",
        POSTGRES_URL: "",
        REDIS_URL: "",
      },
    });

    await writeFile(
      join(harness.paths.configDir, "runtime.env"),
      [
        "FEISHU_APP_ID=file_app_id",
        "FEISHU_APP_SECRET=file_app_secret",
        "POSTGRES_URL=postgres://from-file",
        "REDIS_URL=redis://from-file",
      ].join("\n"),
    );

    const result = await createStatusService({
      env: harness.env,
      healthcheckCodex: async () => {
        throw new Error("codex unavailable");
      },
      probeFeishuCredentialsImpl: async () => ({
        code: "INVALID_CREDENTIALS",
        message: "invalid app credential",
        ok: false,
      }),
      processExists: () => false,
    }).getStatus();

    expect(result.externalDependencies.components.codex_cli.status).toBe("failed");
    expect(result.externalDependencies.components.feishu_credentials.status).toBe("failed");

    await harness.cleanup();
  });

  test("docker daemon 不可用时会归因到 infra 层并影响 overallStatus", async () => {
    const harness = await createRuntimeHarness();
    await writeFile(
      join(harness.paths.configDir, "install-manifest.json"),
      JSON.stringify({
        activeBundlePath: join(harness.paths.configDir, "versions", "dev"),
        activeVersion: "dev",
        serviceDefinitionPath: join(harness.paths.homeDir, "Library", "LaunchAgents", "com.carvis.daemon.plist"),
        status: "installed",
      }),
    );
    await writeFile(
      join(harness.paths.configDir, "state", "infra.json"),
      JSON.stringify({
        postgres: {
          status: "ready",
          summary: "postgres ready",
        },
        redis: {
          status: "ready",
          summary: "redis ready",
        },
      }),
    ).catch(() => null);

    const result = await createStatusService({
      dockerEngine: {
        async preflight() {
          throw new DockerDaemonUnavailableError();
        },
      },
      env: harness.env,
      healthcheckCodex: async () => ({
        message: "codex ready",
        ok: true,
      }),
      probeFeishuCredentialsImpl: async () => ({
        message: "feishu ready",
        ok: true,
      }),
      processExists: () => false,
    }).getStatus();

    expect(result.infra.status).toBe("failed");
    expect(result.infra.components.postgres.summary).toContain("docker daemon is not responding");
    expect(result.overallStatus).toBe("failed");
    expect(result.recommendedActions).toContain("carvis infra start");

    await harness.cleanup();
  });

  test("未安装时不会因为 docker preflight 失败而误报 infra failed", async () => {
    const harness = await createRuntimeHarness();

    const result = await createStatusService({
      dockerEngine: {
        async preflight() {
          throw new DockerDaemonUnavailableError();
        },
      },
      env: harness.env,
      healthcheckCodex: async () => ({
        message: "codex ready",
        ok: true,
      }),
      probeFeishuCredentialsImpl: async () => ({
        message: "feishu ready",
        ok: true,
      }),
      processExists: () => false,
    }).getStatus();

    expect(result.install.status).toBe("missing");
    expect(result.infra.status).toBe("stopped");
    expect(result.recommendedActions).toContain("carvis install");
    expect(result.recommendedActions).not.toContain("carvis infra start");

    await harness.cleanup();
  });
});
