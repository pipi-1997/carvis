import { describe, expect, test } from "bun:test";

import { createRuntimeLogger } from "@carvis/core";

describe("runtime logger", () => {
  test("输出带 fingerprint 的 gateway 启动状态事件", () => {
    const logger = createRuntimeLogger();

    logger.gatewayState("ready", {
      configFingerprint: "fp-123",
      feishuReady: true,
      feishuIngressReady: true,
    });

    expect(logger.listEntries()).toEqual([
      {
        level: "info",
        message: "runtime.gateway.ready",
        context: {
          configFingerprint: "fp-123",
          feishuIngressReady: true,
          feishuReady: true,
          role: "gateway",
          status: "ready",
        },
      },
    ]);
  });

  test("executor 配置漂移时输出结构化失败事件", () => {
    const logger = createRuntimeLogger();

    logger.executorState("failed", {
      configFingerprint: "fp-123",
      consumerActive: false,
      postgresReady: true,
      redisReady: true,
      codexReady: true,
      errorCode: "CONFIG_DRIFT",
      errorMessage: "runtime fingerprints differ",
    });

    expect(logger.listEntries()[0]).toEqual({
      level: "error",
      message: "runtime.executor.failed",
      context: {
        codexReady: true,
        configFingerprint: "fp-123",
        consumerActive: false,
        errorCode: "CONFIG_DRIFT",
        errorMessage: "runtime fingerprints differ",
        postgresReady: true,
        redisReady: true,
        role: "executor",
        status: "failed",
      },
    });
  });
});
