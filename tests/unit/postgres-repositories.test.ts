import { describe, expect, test } from "bun:test";

import { createPostgresRepositories } from "@carvis/core";
import type { Session } from "@carvis/core";

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
});
