import { describe, expect, test } from "bun:test";

import { createPostgresRepositories } from "@carvis/core";
import type { RunPresentation, Session } from "@carvis/core";

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
});
