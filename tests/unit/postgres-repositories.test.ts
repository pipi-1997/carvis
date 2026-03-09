import { describe, expect, test } from "bun:test";

import { createPostgresRepositories } from "@carvis/core";
import type {
  ConversationSessionBinding,
  RunPresentation,
  Session,
  SessionWorkspaceBinding,
  WorkspaceCatalogEntry,
} from "@carvis/core";

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
});
