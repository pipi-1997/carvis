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

  test("续聊绑定状态变更会输出结构化日志", () => {
    const logger = createRuntimeLogger();

    logger.continuationBindingState("bound", {
      agentId: "codex-main",
      chatId: "chat-001",
      runId: "run-001",
      sessionId: "session-001",
      bridgeSessionId: "thread-001",
    });

    expect(logger.listEntries()[0]).toEqual({
      level: "info",
      message: "continuation.binding.bound",
      context: {
        agentId: "codex-main",
        bridgeSessionId: "thread-001",
        chatId: "chat-001",
        role: "executor",
        runId: "run-001",
        sessionId: "session-001",
        status: "bound",
      },
    });
  });

  test("命令归一化结果会输出结构化日志", () => {
    const logger = createRuntimeLogger();

    logger.commandState("unknown", {
      agentId: "codex-main",
      chatId: "chat-ops",
      sessionId: "session-ops",
      command: "/bindd",
      normalizedText: "/bindd ops",
      reason: "unsupported_slash_command",
    });

    expect(logger.listEntries()[0]).toEqual({
      level: "warn",
      message: "command.unknown",
      context: {
        agentId: "codex-main",
        chatId: "chat-ops",
        command: "/bindd",
        normalizedText: "/bindd ops",
        reason: "unsupported_slash_command",
        role: "gateway",
        sessionId: "session-ops",
        status: "unknown",
      },
    });
  });

  test("workspace 解析结果会输出结构化日志", () => {
    const logger = createRuntimeLogger();

    logger.workspaceResolutionState("config", {
      agentId: "codex-main",
      chatId: "chat-ops",
      sessionId: "session-ops",
      trigger: "prompt",
      workspaceKey: "ops",
      workspacePath: "/tmp/carvis-ops-workspace",
    });

    expect(logger.listEntries()[0]).toEqual({
      level: "info",
      message: "workspace.resolution.config",
      context: {
        agentId: "codex-main",
        chatId: "chat-ops",
        role: "gateway",
        sessionId: "session-ops",
        status: "config",
        trigger: "prompt",
        workspaceKey: "ops",
        workspacePath: "/tmp/carvis-ops-workspace",
      },
    });
  });

  test("workspace bind 失败会输出错误日志", () => {
    const logger = createRuntimeLogger();

    logger.workspaceBindState("create_failed", {
      agentId: "codex-main",
      chatId: "chat-ops",
      sessionId: "session-ops",
      workspaceKey: "feature-a",
      reason: "workspace template unavailable: missing",
    });

    expect(logger.listEntries()[0]).toEqual({
      level: "error",
      message: "workspace.bind.create_failed",
      context: {
        agentId: "codex-main",
        chatId: "chat-ops",
        reason: "workspace template unavailable: missing",
        role: "gateway",
        sessionId: "session-ops",
        status: "create_failed",
        workspaceKey: "feature-a",
      },
    });
  });
});
