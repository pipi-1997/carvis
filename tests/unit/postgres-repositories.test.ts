import { describe, expect, test } from "bun:test";

import type {
  ConversationSessionBinding,
  EffectiveManagedSchedule,
  RunPresentation,
  ScheduleManagementAction,
  Session,
  SessionWorkspaceBinding,
  TriggerDefinition,
  TriggerDefinitionOverride,
  TriggerExecution,
  WorkspaceCatalogEntry,
} from "@carvis/core";
import { createPostgresRepositories } from "../../packages/core/src/storage/repositories.ts";

describe("postgres repositories", () => {
  test("getSessionById 将 sessions 字段映射为领域模型的 camelCase", async () => {
    const queries: Array<{ params?: unknown[]; sql: string }> = [];
    const repositories = createPostgresRepositories({
      async query<T>(sql: string, params?: unknown[]) {
        queries.push({ sql, params });
        return {
          rows: [
            {
              id: "session-1",
              channel: "feishu",
              chatId: "oc_test_chat",
              agentId: "codex-main",
              workspace: "/Users/pipi/workspace/carvis",
              status: "active",
              lastSeenAt: "2026-03-08T00:00:00.000Z",
            },
          ] as T[],
        };
      },
    });

    const session = await repositories.sessions.getSessionById("session-1");

    expect(session).toEqual({
      id: "session-1",
      channel: "feishu",
      chatId: "oc_test_chat",
      agentId: "codex-main",
      workspace: "/Users/pipi/workspace/carvis",
      status: "active",
      lastSeenAt: "2026-03-08T00:00:00.000Z",
    } satisfies Session);
    expect(queries).toEqual([
      {
        sql: expect.stringContaining('chat_id AS "chatId"'),
        params: ["session-1"],
      },
    ]);
  });

  test("getPresentationByRunId 将 run_presentations 字段映射为领域模型的 camelCase", async () => {
    const queries: Array<{ params?: unknown[]; sql: string }> = [];
    const repositories = createPostgresRepositories({
      async query<T>(sql: string, params?: unknown[]) {
        queries.push({ sql, params });
        return {
          rows: [
            {
              runId: "run-1",
              sessionId: "session-1",
              chatId: "oc_test_chat",
              phase: "streaming",
              terminalStatus: null,
              streamingMessageId: "om_card_message",
              streamingCardId: "card-1",
              streamingElementId: "element-1",
              fallbackTerminalMessageId: null,
              degradedReason: null,
              lastOutputSequence: 3,
              lastOutputExcerpt: "正在修改文件",
              createdAt: "2026-03-09T00:00:00.000Z",
              updatedAt: "2026-03-09T00:00:01.000Z",
            },
          ] as T[],
        };
      },
    });

    const presentation = await repositories.presentations.getPresentationByRunId("run-1");

    expect(presentation).toEqual({
      runId: "run-1",
      sessionId: "session-1",
      chatId: "oc_test_chat",
      phase: "streaming",
      terminalStatus: null,
      streamingMessageId: "om_card_message",
      streamingCardId: "card-1",
      streamingElementId: "element-1",
      fallbackTerminalMessageId: null,
      degradedReason: null,
      lastOutputSequence: 3,
      lastOutputExcerpt: "正在修改文件",
      createdAt: "2026-03-09T00:00:00.000Z",
      updatedAt: "2026-03-09T00:00:01.000Z",
    } satisfies RunPresentation);
    expect(queries).toEqual([
      {
        sql: expect.stringContaining('streaming_message_id AS "streamingMessageId"'),
        params: ["run-1"],
      },
    ]);
  });

  test("getBindingBySessionId 将 conversation_session_bindings 字段映射为领域模型的 camelCase", async () => {
    const queries: Array<{ params?: unknown[]; sql: string }> = [];
    const repositories = createPostgresRepositories({
      async query<T>(sql: string, params?: unknown[]) {
        queries.push({ sql, params });
        return {
          rows: [
            {
              sessionId: "session-1",
              chatId: "oc_test_chat",
              agentId: "codex-main",
              workspace: "/Users/pipi/workspace/carvis",
              bridge: "codex",
              bridgeSessionId: "thread-001",
              sandboxMode: "workspace-write",
              mode: "continuation",
              status: "bound",
              lastBoundAt: "2026-03-09T00:00:00.000Z",
              lastUsedAt: "2026-03-09T00:00:00.000Z",
              lastResetAt: null,
              lastInvalidatedAt: null,
              lastInvalidationReason: null,
              lastRecoveryAt: null,
              lastRecoveryResult: null,
              createdAt: "2026-03-09T00:00:00.000Z",
              updatedAt: "2026-03-09T00:00:01.000Z",
            },
          ] as T[],
        };
      },
    });

    const binding = await repositories.conversationSessionBindings.getBindingBySessionId("session-1");

    expect(binding).toEqual({
      sessionId: "session-1",
      chatId: "oc_test_chat",
      agentId: "codex-main",
      workspace: "/Users/pipi/workspace/carvis",
      bridge: "codex",
      bridgeSessionId: "thread-001",
      sandboxMode: "workspace-write",
      mode: "continuation",
      status: "bound",
      lastBoundAt: "2026-03-09T00:00:00.000Z",
      lastUsedAt: "2026-03-09T00:00:00.000Z",
      lastResetAt: null,
      lastInvalidatedAt: null,
      lastInvalidationReason: null,
      lastRecoveryAt: null,
      lastRecoveryResult: null,
      createdAt: "2026-03-09T00:00:00.000Z",
      updatedAt: "2026-03-09T00:00:01.000Z",
    } satisfies ConversationSessionBinding);
    expect(queries).toEqual([
      {
        sql: expect.stringContaining('bridge_session_id AS "bridgeSessionId"'),
        params: ["session-1"],
      },
    ]);
  });

  test("saveBindingContinuation 会写入 upsert 所需字段", async () => {
    const queries: Array<{ params?: unknown[]; sql: string }> = [];
    const repositories = createPostgresRepositories({
      async query<T>(sql: string, params?: unknown[]) {
        queries.push({ sql, params });
        if (sql.includes("RETURNING")) {
          return {
            rows: [
              {
                sessionId: "session-1",
                chatId: "oc_test_chat",
                agentId: "codex-main",
                workspace: "/Users/pipi/workspace/carvis",
                bridge: "codex",
                bridgeSessionId: "thread-001",
                sandboxMode: "danger-full-access",
                mode: "continuation",
                status: "bound",
                lastBoundAt: "2026-03-09T00:00:00.000Z",
                lastUsedAt: "2026-03-09T00:00:00.000Z",
                lastResetAt: null,
                lastInvalidatedAt: null,
                lastInvalidationReason: null,
                lastRecoveryAt: null,
                lastRecoveryResult: null,
                createdAt: "2026-03-09T00:00:00.000Z",
                updatedAt: "2026-03-09T00:00:00.000Z",
              },
            ] as T[],
          };
        }

        return { rows: [] as T[] };
      },
    });

    await repositories.conversationSessionBindings.saveBindingContinuation({
      session: {
        id: "session-1",
        channel: "feishu",
        chatId: "oc_test_chat",
        agentId: "codex-main",
        workspace: "/Users/pipi/workspace/carvis",
        status: "active",
        lastSeenAt: "2026-03-09T00:00:00.000Z",
      },
      bridge: "codex",
      bridgeSessionId: "thread-001",
      sandboxMode: "danger-full-access",
      status: "bound",
      now: new Date("2026-03-09T00:00:00.000Z"),
    });

    expect(queries[0]?.sql).toContain("INSERT INTO conversation_session_bindings");
    expect(queries[0]?.params).toEqual([
      "session-1",
      "oc_test_chat",
      "codex-main",
      "/Users/pipi/workspace/carvis",
      "codex",
      "thread-001",
      "danger-full-access",
      "continuation",
      "bound",
      "2026-03-09T00:00:00.000Z",
      "2026-03-09T00:00:00.000Z",
      null,
      null,
      null,
      null,
      null,
      "2026-03-09T00:00:00.000Z",
      "2026-03-09T00:00:00.000Z",
    ]);
  });

  test("chat sandbox override 仓储会映射与写入过期时间和 mode", async () => {
    const queries: Array<{ params?: unknown[]; sql: string }> = [];
    const repositories = createPostgresRepositories({
      async query<T>(sql: string, params?: unknown[]) {
        queries.push({ sql, params });
        return {
          rows: [
            {
              sessionId: "session-1",
              chatId: "oc_test_chat",
              agentId: "codex-main",
              workspace: "/Users/pipi/workspace/carvis",
              sandboxMode: "danger-full-access",
              expiresAt: "2026-03-09T00:30:00.000Z",
              setByUserId: "user-001",
              createdAt: "2026-03-09T00:00:00.000Z",
              updatedAt: "2026-03-09T00:00:00.000Z",
            },
          ] as T[],
        };
      },
    });

    const override = await repositories.chatSandboxOverrides.upsertOverride({
      sessionId: "session-1",
      chatId: "oc_test_chat",
      agentId: "codex-main",
      workspace: "/Users/pipi/workspace/carvis",
      sandboxMode: "danger-full-access",
      expiresAt: "2026-03-09T00:30:00.000Z",
      setByUserId: "user-001",
      now: new Date("2026-03-09T00:00:00.000Z"),
    });

    expect(override).toEqual({
      sessionId: "session-1",
      chatId: "oc_test_chat",
      agentId: "codex-main",
      workspace: "/Users/pipi/workspace/carvis",
      sandboxMode: "danger-full-access",
      expiresAt: "2026-03-09T00:30:00.000Z",
      setByUserId: "user-001",
      createdAt: "2026-03-09T00:00:00.000Z",
      updatedAt: "2026-03-09T00:00:00.000Z",
    });
    expect(queries[0]?.sql).toContain("INSERT INTO chat_sandbox_overrides");
    expect(queries[0]?.params).toEqual([
      "session-1",
      "oc_test_chat",
      "codex-main",
      "/Users/pipi/workspace/carvis",
      "danger-full-access",
      "2026-03-09T00:30:00.000Z",
      "user-001",
      "2026-03-09T00:00:00.000Z",
      "2026-03-09T00:00:00.000Z",
    ]);
  });

  test("getBindingBySessionId 将 session_workspace_bindings 字段映射为领域模型的 camelCase", async () => {
    const queries: Array<{ params?: unknown[]; sql: string }> = [];
    const repositories = createPostgresRepositories({
      async query<T>(sql: string, params?: unknown[]) {
        queries.push({ sql, params });
        return {
          rows: [
            {
              sessionId: "session-1",
              chatId: "oc_test_chat",
              workspaceKey: "ops",
              bindingSource: "manual",
              createdAt: "2026-03-09T00:00:00.000Z",
              updatedAt: "2026-03-09T00:00:01.000Z",
            },
          ] as T[],
        };
      },
    });

    const binding = await repositories.sessionWorkspaceBindings.getBindingBySessionId("session-1");

    expect(binding).toEqual({
      sessionId: "session-1",
      chatId: "oc_test_chat",
      workspaceKey: "ops",
      bindingSource: "manual",
      createdAt: "2026-03-09T00:00:00.000Z",
      updatedAt: "2026-03-09T00:00:01.000Z",
    } satisfies SessionWorkspaceBinding);
    expect(queries).toEqual([
      {
        sql: expect.stringContaining('workspace_key AS "workspaceKey"'),
        params: ["session-1"],
      },
    ]);
  });

  test("createEntry 会写入 workspace_catalog 所需字段", async () => {
    const queries: Array<{ params?: unknown[]; sql: string }> = [];
    const repositories = createPostgresRepositories({
      async query<T>(sql: string, params?: unknown[]) {
        queries.push({ sql, params });
        return {
          rows: [
            {
              workspaceKey: "feature-a",
              workspacePath: "/tmp/managed/feature-a",
              provisionSource: "template_created",
              templateRef: "/tmp/template",
              createdAt: "2026-03-09T00:00:00.000Z",
              updatedAt: "2026-03-09T00:00:00.000Z",
            },
          ] as T[],
        };
      },
    });

    const entry = await repositories.workspaceCatalog.createEntry({
      workspaceKey: "feature-a",
      workspacePath: "/tmp/managed/feature-a",
      provisionSource: "template_created",
      templateRef: "/tmp/template",
      now: new Date("2026-03-09T00:00:00.000Z"),
    });

    expect(entry).toEqual({
      workspaceKey: "feature-a",
      workspacePath: "/tmp/managed/feature-a",
      provisionSource: "template_created",
      templateRef: "/tmp/template",
      createdAt: "2026-03-09T00:00:00.000Z",
      updatedAt: "2026-03-09T00:00:00.000Z",
    } satisfies WorkspaceCatalogEntry);
    expect(queries[0]?.sql).toContain("INSERT INTO workspace_catalog");
    expect(queries[0]?.params).toEqual([
      "feature-a",
      "/tmp/managed/feature-a",
      "template_created",
      "/tmp/template",
      "2026-03-09T00:00:00.000Z",
      "2026-03-09T00:00:00.000Z",
    ]);
  });

  test("getEffectiveDefinitionById 会返回 baseline 与 override 合并后的字段", async () => {
    const queries: Array<{ params?: unknown[]; sql: string }> = [];
    const repositories = createPostgresRepositories({
      async query<T>(sql: string, params?: unknown[]) {
        queries.push({ sql, params });
        return {
          rows: [
            {
              id: "daily-ops-report",
              definitionId: "daily-ops-report",
              sourceType: "scheduled_job",
              definitionOrigin: "config",
              slug: null,
              workspace: "/tmp/managed/ops",
              agentId: "codex-main",
              label: "日报-已调整",
              enabled: true,
              promptTemplate: "新模板",
              deliveryTarget: { kind: "none" },
              scheduleExpr: "0 10 * * *",
              timezone: "Asia/Shanghai",
              nextDueAt: "2026-03-10T02:00:00.000Z",
              lastTriggeredAt: null,
              lastTriggerStatus: null,
              lastManagedAt: "2026-03-10T01:00:00.000Z",
              lastManagedBySessionId: "session-001",
              lastManagedByChatId: "chat-001",
              lastManagementAction: "update",
              secretRef: null,
              requiredFields: [],
              optionalFields: [],
              replayWindowSeconds: null,
              overridden: true,
              createdAt: "2026-03-09T00:00:00.000Z",
              updatedAt: "2026-03-10T01:00:00.000Z",
            },
          ] as T[],
        };
      },
    });

    const definition = await repositories.triggerDefinitions.getEffectiveDefinitionById("daily-ops-report");

    expect(definition).toEqual({
      id: "daily-ops-report",
      definitionId: "daily-ops-report",
      sourceType: "scheduled_job",
      definitionOrigin: "config",
      slug: null,
      workspace: "/tmp/managed/ops",
      agentId: "codex-main",
      label: "日报-已调整",
      enabled: true,
      promptTemplate: "新模板",
      deliveryTarget: { kind: "none" },
      scheduleExpr: "0 10 * * *",
      timezone: "Asia/Shanghai",
      nextDueAt: "2026-03-10T02:00:00.000Z",
      lastTriggeredAt: null,
      lastTriggerStatus: null,
      lastManagedAt: "2026-03-10T01:00:00.000Z",
      lastManagedBySessionId: "session-001",
      lastManagedByChatId: "chat-001",
      lastManagementAction: "update",
      secretRef: null,
      requiredFields: [],
      optionalFields: [],
      replayWindowSeconds: null,
      overridden: true,
      createdAt: "2026-03-09T00:00:00.000Z",
      updatedAt: "2026-03-10T01:00:00.000Z",
    } satisfies EffectiveManagedSchedule);
    expect(queries[0]?.sql).toContain('definition_origin AS "definitionOrigin"');
  });

  test("upsertOverride 会写入 trigger_definition_overrides 所需字段", async () => {
    const queries: Array<{ params?: unknown[]; sql: string }> = [];
    const repositories = createPostgresRepositories({
      async query<T>(sql: string, params?: unknown[]) {
        queries.push({ sql, params });
        return {
          rows: [
            {
              definitionId: "daily-ops-report",
              workspace: "/tmp/managed/ops",
              label: "日报-已调整",
              enabled: true,
              scheduleExpr: "0 10 * * *",
              timezone: "Asia/Shanghai",
              promptTemplate: "新模板",
              deliveryTarget: { kind: "none" },
              managedBySessionId: "session-001",
              managedByChatId: "chat-001",
              managedByUserId: "user-001",
              appliedAt: "2026-03-10T01:00:00.000Z",
              createdAt: "2026-03-10T01:00:00.000Z",
              updatedAt: "2026-03-10T01:00:00.000Z",
            },
          ] as T[],
        };
      },
    });

    const override = await repositories.triggerDefinitionOverrides.upsertOverride({
      definitionId: "daily-ops-report",
      workspace: "/tmp/managed/ops",
      label: "日报-已调整",
      enabled: true,
      scheduleExpr: "0 10 * * *",
      timezone: "Asia/Shanghai",
      promptTemplate: "新模板",
      deliveryTarget: { kind: "none" },
      managedBySessionId: "session-001",
      managedByChatId: "chat-001",
      managedByUserId: "user-001",
      appliedAt: "2026-03-10T01:00:00.000Z",
      now: new Date("2026-03-10T01:00:00.000Z"),
    });

    expect(override).toEqual({
      definitionId: "daily-ops-report",
      workspace: "/tmp/managed/ops",
      label: "日报-已调整",
      enabled: true,
      scheduleExpr: "0 10 * * *",
      timezone: "Asia/Shanghai",
      promptTemplate: "新模板",
      deliveryTarget: { kind: "none" },
      managedBySessionId: "session-001",
      managedByChatId: "chat-001",
      managedByUserId: "user-001",
      appliedAt: "2026-03-10T01:00:00.000Z",
      createdAt: "2026-03-10T01:00:00.000Z",
      updatedAt: "2026-03-10T01:00:00.000Z",
    } satisfies TriggerDefinitionOverride);
    expect(queries[0]?.sql).toContain("INSERT INTO trigger_definition_overrides");
  });

  test("createAction 会写入 schedule_management_actions 所需字段", async () => {
    const queries: Array<{ params?: unknown[]; sql: string }> = [];
    const repositories = createPostgresRepositories({
      async query<T>(sql: string, params?: unknown[]) {
        queries.push({ sql, params });
        return {
          rows: [
            {
              id: "action-001",
              sessionId: "session-001",
              chatId: "chat-001",
              workspace: "/tmp/managed/ops",
              userId: "user-001",
              requestedText: "把日报改到 10 点",
              actionType: "update",
              resolutionStatus: "executed",
              targetDefinitionId: "daily-ops-report",
              reason: null,
              responseSummary: "已更新日报",
              createdAt: "2026-03-10T01:00:00.000Z",
              updatedAt: "2026-03-10T01:00:00.000Z",
            },
          ] as T[],
        };
      },
    });

    const action = await repositories.scheduleManagementActions.createAction({
      sessionId: "session-001",
      chatId: "chat-001",
      workspace: "/tmp/managed/ops",
      userId: "user-001",
      requestedText: "把日报改到 10 点",
      actionType: "update",
      resolutionStatus: "executed",
      targetDefinitionId: "daily-ops-report",
      reason: null,
      responseSummary: "已更新日报",
      now: new Date("2026-03-10T01:00:00.000Z"),
    });

    expect(action).toEqual({
      id: "action-001",
      sessionId: "session-001",
      chatId: "chat-001",
      workspace: "/tmp/managed/ops",
      userId: "user-001",
      requestedText: "把日报改到 10 点",
      actionType: "update",
      resolutionStatus: "executed",
      targetDefinitionId: "daily-ops-report",
      reason: null,
      responseSummary: "已更新日报",
      createdAt: "2026-03-10T01:00:00.000Z",
      updatedAt: "2026-03-10T01:00:00.000Z",
    } satisfies ScheduleManagementAction);
    expect(queries[0]?.sql).toContain("INSERT INTO schedule_management_actions");
  });

  test("createQueuedRun 支持 sessionless trigger run 与 delivery target", async () => {
    const queries: Array<{ params?: unknown[]; sql: string }> = [];
    const repositories = createPostgresRepositories({
      async query<T>(sql: string, params?: unknown[]) {
        queries.push({ sql, params });
        if (sql.includes("SELECT id, session_id")) {
          return {
            rows: [
              {
                id: "run-trigger-1",
                sessionId: null,
                agentId: "codex-main",
                workspace: "/Users/pipi/workspace/carvis",
                status: "queued",
                prompt: "生成今日巡检摘要",
                triggerSource: "scheduled_job",
                triggerExecutionId: "execution-1",
                triggerMessageId: null,
                triggerUserId: null,
                timeoutSeconds: 60,
                requestedSandboxMode: "workspace-write",
                resolvedSandboxMode: "workspace-write",
                sandboxModeSource: "workspace_default",
                requestedSessionMode: "fresh",
                requestedBridgeSessionId: null,
                resolvedBridgeSessionId: null,
                sessionRecoveryAttempted: false,
                sessionRecoveryResult: null,
                deliveryTarget: {
                  kind: "feishu_chat",
                  chatId: "oc_ops_group",
                },
                queuePosition: 0,
                startedAt: null,
                finishedAt: null,
                failureCode: null,
                failureMessage: null,
                cancelRequestedAt: null,
                createdAt: "2026-03-10T00:00:00.000Z",
              },
            ] as T[],
          };
        }

        return { rows: [] as T[] };
      },
    });

    const run = await repositories.runs.createQueuedRun({
      sessionId: null,
      agentId: "codex-main",
      workspace: "/Users/pipi/workspace/carvis",
      prompt: "生成今日巡检摘要",
      triggerSource: "scheduled_job",
      triggerExecutionId: "execution-1",
      triggerMessageId: null,
      triggerUserId: null,
      timeoutSeconds: 60,
      requestedSandboxMode: "workspace-write",
      resolvedSandboxMode: "workspace-write",
      sandboxModeSource: "workspace_default",
      requestedSessionMode: "fresh",
      requestedBridgeSessionId: null,
      deliveryTarget: {
        kind: "feishu_chat",
        chatId: "oc_ops_group",
      },
      now: new Date("2026-03-10T00:00:00.000Z"),
    });

    expect(run.sessionId).toBeNull();
    expect(run.triggerSource).toBe("scheduled_job");
    expect(run.triggerExecutionId).toBe("execution-1");
    expect(run.resolvedSandboxMode).toBe("workspace-write");
    expect(run.sandboxModeSource).toBe("workspace_default");
    expect(run.deliveryTarget).toEqual({
      kind: "feishu_chat",
      chatId: "oc_ops_group",
    });
    expect(queries[0]?.sql).toContain("INSERT INTO agent_runs");
  });

  test("trigger repositories 映射 trigger definition 与 execution 字段", async () => {
    const queries: Array<{ params?: unknown[]; sql: string }> = [];
    const repositories = createPostgresRepositories({
      async query<T>(sql: string, params?: unknown[]) {
        queries.push({ sql, params });
        if (sql.includes("FROM trigger_definitions")) {
          return {
            rows: [
              {
                id: "build-failed",
                sourceType: "external_webhook",
                slug: "build-failed",
                enabled: true,
                workspace: "/Users/pipi/workspace/carvis",
                agentId: "codex-main",
                promptTemplate: "分析 {{summary}}",
                deliveryTarget: {
                  kind: "none",
                },
                scheduleExpr: null,
                timezone: null,
                nextDueAt: null,
                lastTriggeredAt: "2026-03-10T00:00:00.000Z",
                lastTriggerStatus: "accepted",
                secretRef: "CARVIS_WEBHOOK_BUILD_FAILED_SECRET",
                requiredFields: ["summary"],
                optionalFields: [],
                replayWindowSeconds: 300,
                definitionHash: null,
                createdAt: "2026-03-10T00:00:00.000Z",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ] as T[],
          };
        }

        if (sql.includes("FROM trigger_executions")) {
          return {
            rows: [
              {
                id: "execution-1",
                definitionId: "build-failed",
                sourceType: "external_webhook",
                status: "rejected",
                triggeredAt: "2026-03-10T00:00:00.000Z",
                inputDigest: "sha256:abc",
                runId: null,
                deliveryStatus: null,
                rejectionReason: "invalid_signature",
                failureCode: null,
                failureMessage: null,
                finishedAt: "2026-03-10T00:00:00.000Z",
                createdAt: "2026-03-10T00:00:00.000Z",
                updatedAt: "2026-03-10T00:00:00.000Z",
              },
            ] as T[],
          };
        }

        return { rows: [] as T[] };
      },
    });

    const definition = await repositories.triggerDefinitions.getDefinitionById("build-failed");
    const execution = await repositories.triggerExecutions.getExecutionById("execution-1");

    expect(definition).toEqual({
      id: "build-failed",
      sourceType: "external_webhook",
      slug: "build-failed",
      enabled: true,
      workspace: "/Users/pipi/workspace/carvis",
      agentId: "codex-main",
      promptTemplate: "分析 {{summary}}",
      deliveryTarget: {
        kind: "none",
      },
      scheduleExpr: null,
      timezone: null,
      nextDueAt: null,
      lastTriggeredAt: "2026-03-10T00:00:00.000Z",
      lastTriggerStatus: "accepted",
      secretRef: "CARVIS_WEBHOOK_BUILD_FAILED_SECRET",
      requiredFields: ["summary"],
      optionalFields: [],
      replayWindowSeconds: 300,
      definitionHash: null,
      createdAt: "2026-03-10T00:00:00.000Z",
      updatedAt: "2026-03-10T00:00:00.000Z",
    } satisfies TriggerDefinition);
    expect(execution).toEqual({
      id: "execution-1",
      definitionId: "build-failed",
      sourceType: "external_webhook",
      status: "rejected",
      triggeredAt: "2026-03-10T00:00:00.000Z",
      inputDigest: "sha256:abc",
      runId: null,
      deliveryStatus: null,
      rejectionReason: "invalid_signature",
      failureCode: null,
      failureMessage: null,
      finishedAt: "2026-03-10T00:00:00.000Z",
      createdAt: "2026-03-10T00:00:00.000Z",
      updatedAt: "2026-03-10T00:00:00.000Z",
    } satisfies TriggerExecution);
    expect(queries[0]?.sql).toContain('source_type AS "sourceType"');
  });
});
