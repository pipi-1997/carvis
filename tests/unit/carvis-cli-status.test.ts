import { describe, expect, test } from "bun:test";

import { summarizeRuntimeStatus } from "../../packages/carvis-cli/src/status.ts";

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
});
