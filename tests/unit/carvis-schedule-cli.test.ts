import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  parseCarvisScheduleCommand,
  runCarvisScheduleCli,
} from "../../packages/carvis-schedule-cli/src/index.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("carvis-schedule cli", () => {
  test("解析 create 命令与显式上下文 flags", () => {
    const parsed = parseCarvisScheduleCommand([
      "create",
      "--gateway-base-url",
      "http://127.0.0.1:8787",
      "--workspace",
      "/tmp/workspaces/main",
      "--session-id",
      "session-001",
      "--chat-id",
      "chat-001",
      "--user-id",
      "user-001",
      "--requested-text",
      "明天早上 9 点提醒我 real chat verify",
      "--label",
      "real chat verify",
      "--schedule-expr",
      "0 9 12 3 *",
      "--timezone",
      "Asia/Shanghai",
      "--prompt-template",
      "real chat verify",
      "--delivery-kind",
      "feishu_chat",
      "--delivery-chat-id",
      "chat-001",
    ]);

    expect(parsed).toEqual({
      ok: true,
      command: {
        actionType: "create",
        gatewayBaseUrl: "http://127.0.0.1:8787",
        workspace: "/tmp/workspaces/main",
        sessionId: "session-001",
        chatId: "chat-001",
        userId: "user-001",
        requestedText: "明天早上 9 点提醒我 real chat verify",
        invocation: {
          actionType: "create",
          label: "real chat verify",
          scheduleExpr: "0 9 12 3 *",
          timezone: "Asia/Shanghai",
          promptTemplate: "real chat verify",
          deliveryTarget: {
            kind: "feishu_chat",
            chatId: "chat-001",
            label: null,
          },
        },
      },
    });
  });

  test("省略运行时 flags 时会从隐藏环境变量和 cwd 解析上下文", () => {
    const parsed = parseCarvisScheduleCommand(
      [
        "create",
        "--label",
        "real chat verify",
        "--schedule-expr",
        "0 9 12 3 *",
      ],
      {
        cwd: "/tmp/workspaces/main",
        env: {
          CARVIS_SESSION_ID: "session-001",
          CARVIS_CHAT_ID: "chat-001",
          CARVIS_USER_ID: "user-001",
          CARVIS_REQUESTED_TEXT: "明天早上 9 点提醒我 real chat verify",
        },
      },
    );

    expect(parsed).toEqual({
      ok: true,
      command: expect.objectContaining({
        actionType: "create",
        gatewayBaseUrl: null,
        workspace: "/tmp/workspaces/main",
        sessionId: "session-001",
        chatId: "chat-001",
        userId: "user-001",
        requestedText: "明天早上 9 点提醒我 real chat verify",
      }),
    });
  });

  test("会把显式 flag 中的 shell 变量字面量展开成环境变量值", () => {
    const previous = process.env.CARVIS_GATEWAY_BASE_URL;
    process.env.CARVIS_GATEWAY_BASE_URL = "http://127.0.0.1:8787";

    try {
      const parsed = parseCarvisScheduleCommand([
        "list",
        "--gateway-base-url",
        "$CARVIS_GATEWAY_BASE_URL",
        "--workspace",
        "/tmp/workspaces/main",
        "--session-id",
        "session-001",
        "--chat-id",
        "chat-001",
        "--requested-text",
        "列出定时任务",
      ]);

      expect(parsed).toEqual({
        ok: true,
        command: {
          actionType: "list",
          gatewayBaseUrl: "http://127.0.0.1:8787",
          workspace: "/tmp/workspaces/main",
          sessionId: "session-001",
          chatId: "chat-001",
          userId: null,
          requestedText: "列出定时任务",
          invocation: {
            actionType: "list",
          },
        },
      });
    } finally {
      if (previous === undefined) {
        delete process.env.CARVIS_GATEWAY_BASE_URL;
      } else {
        process.env.CARVIS_GATEWAY_BASE_URL = previous;
      }
    }
  });

  test("解析 list update disable 命令", () => {
    expect(
      parseCarvisScheduleCommand([
        "list",
        "--gateway-base-url",
        "http://127.0.0.1:8787",
        "--workspace",
        "/tmp/workspaces/main",
        "--session-id",
        "session-001",
        "--chat-id",
        "chat-001",
        "--requested-text",
        "列出定时任务",
      ]),
    ).toEqual({
      ok: true,
      command: {
        actionType: "list",
        gatewayBaseUrl: "http://127.0.0.1:8787",
        workspace: "/tmp/workspaces/main",
        sessionId: "session-001",
        chatId: "chat-001",
        userId: null,
        requestedText: "列出定时任务",
        invocation: {
          actionType: "list",
        },
      },
    });

    expect(
      parseCarvisScheduleCommand([
        "update",
        "--gateway-base-url",
        "http://127.0.0.1:8787",
        "--workspace",
        "/tmp/workspaces/main",
        "--session-id",
        "session-001",
        "--chat-id",
        "chat-001",
        "--requested-text",
        "把日报改到 10 点",
        "--target-reference",
        "日报",
        "--schedule-expr",
        "0 10 * * *",
      ]),
    ).toEqual({
      ok: true,
      command: {
        actionType: "update",
        gatewayBaseUrl: "http://127.0.0.1:8787",
        workspace: "/tmp/workspaces/main",
        sessionId: "session-001",
        chatId: "chat-001",
        userId: null,
        requestedText: "把日报改到 10 点",
        invocation: {
          actionType: "update",
          targetReference: "日报",
          scheduleExpr: "0 10 * * *",
        },
      },
    });

    expect(
      parseCarvisScheduleCommand([
        "disable",
        "--gateway-base-url",
        "http://127.0.0.1:8787",
        "--workspace",
        "/tmp/workspaces/main",
        "--session-id",
        "session-001",
        "--chat-id",
        "chat-001",
        "--requested-text",
        "停用日报",
        "--definition-id",
        "definition-001",
      ]),
    ).toEqual({
      ok: true,
      command: {
        actionType: "disable",
        gatewayBaseUrl: "http://127.0.0.1:8787",
        workspace: "/tmp/workspaces/main",
        sessionId: "session-001",
        chatId: "chat-001",
        userId: null,
        requestedText: "停用日报",
        invocation: {
          actionType: "disable",
          definitionId: "definition-001",
        },
      },
    });
  });

  test("stdout JSON 与 exit code 统一映射 executed needs_clarification rejected", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const results = [
      { status: "executed", reason: null, targetDefinitionId: "definition-001", summary: "已创建" },
      {
        status: "needs_clarification",
        reason: "ambiguous_target",
        question: "请说明是哪一个日报",
        targetDefinitionId: null,
        summary: "请说明是哪一个日报",
      },
      { status: "rejected", reason: "unsupported_schedule", targetDefinitionId: null, summary: "不支持该时间表达" },
    ] as const;

    for (const expected of results) {
      const exitCode = await runCarvisScheduleCli(
        [
          "list",
          "--gateway-base-url",
          "http://127.0.0.1:8787",
          "--workspace",
          "/tmp/workspaces/main",
          "--session-id",
          "session-001",
          "--chat-id",
          "chat-001",
          "--requested-text",
          "列出定时任务",
        ],
        {
          stdout(text) {
            stdout.push(text);
          },
          stderr(text) {
            stderr.push(text);
          },
          gatewayClient: {
            execute: async () => expected,
          },
        },
      );

      expect(JSON.parse(stdout.pop() ?? "")).toEqual(expected);
      expect(stderr).toEqual([]);
      expect(exitCode).toBe(
        expected.status === "executed" ? 0 : expected.status === "needs_clarification" ? 2 : 3,
      );
    }
  });

  test("transport 或内部失败返回 exit code 4，stdout 仍输出单个 JSON 对象，stderr 仅用于调试", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCarvisScheduleCli(
      [
        "list",
        "--gateway-base-url",
        "http://127.0.0.1:8787",
        "--workspace",
        "/tmp/workspaces/main",
        "--session-id",
        "session-001",
        "--chat-id",
        "chat-001",
        "--requested-text",
        "列出定时任务",
      ],
      {
        stdout(text) {
          stdout.push(text);
        },
        stderr(text) {
          stderr.push(text);
        },
        gatewayClient: {
          execute: async () => {
            throw new Error("gateway unavailable");
          },
        },
      },
    );

    expect(exitCode).toBe(4);
    expect(JSON.parse(stdout[0] ?? "")).toEqual({
      status: "failed",
      reason: "transport_failure",
      targetDefinitionId: null,
      summary: "gateway unavailable",
    });
    expect(stderr.join("")).toContain("gateway unavailable");
  });
});
