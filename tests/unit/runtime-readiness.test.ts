import { describe, expect, test } from "bun:test";

import { evaluateExecutorReadiness } from "../../apps/executor/src/services/runtime-readiness.ts";

describe("executor runtime readiness", () => {
  test("生成 startup report 后会通过回调暴露给上层", async () => {
    const reports: Array<{
      status: string;
      errorCode?: string;
      codexReady: boolean;
    }> = [];

    const report = await evaluateExecutorReadiness(
      {
        bridge: {
          healthcheck: async () => ({
            message: "codex ready",
            ok: true,
          }),
        },
        configFingerprint: "fingerprint-001",
        onReport(nextReport) {
          reports.push(nextReport);
        },
        services: {
          postgres: {
            ping: async () => true,
          },
          redis: {
            ping: async () => true,
          },
        },
      },
      "startup",
    );

    expect(report.status).toBe("ready");
    expect(reports).toEqual([
      expect.objectContaining({
        status: "ready",
        codexReady: true,
      }),
    ]);
  });

  test("依赖失败时回调收到 failed report", async () => {
    const reports: Array<{
      status: string;
      errorCode?: string;
      codexReady: boolean;
    }> = [];

    const report = await evaluateExecutorReadiness(
      {
        bridge: {
          healthcheck: async () => {
            throw new Error("codex unavailable");
          },
        },
        configFingerprint: "fingerprint-002",
        onReport(nextReport) {
          reports.push(nextReport);
        },
        services: {
          postgres: {
            ping: async () => true,
          },
          redis: {
            ping: async () => true,
          },
        },
      },
      "startup",
    );

    expect(report.status).toBe("failed");
    expect(reports).toEqual([
      expect.objectContaining({
        status: "failed",
        errorCode: "CODEX_UNAVAILABLE",
        codexReady: false,
      }),
    ]);
  });
});
