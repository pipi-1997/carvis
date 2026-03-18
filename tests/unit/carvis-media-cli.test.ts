import { afterEach, describe, expect, mock, test } from "bun:test";

import {
  createCarvisMediaGatewayClient,
  parseCarvisMediaCommand,
  runCarvisMediaCli,
} from "../../packages/carvis-media-cli/src/index.ts";
import type { MediaToolResult } from "../../packages/core/src/domain/models.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("carvis-media cli", () => {
  test("解析 send 命令与显式上下文 flags", () => {
    const parsed = parseCarvisMediaCommand([
      "send",
      "--gateway-base-url",
      "http://127.0.0.1:8787",
      "--workspace",
      "/tmp/workspaces/main",
      "--run-id",
      "run-001",
      "--session-id",
      "session-001",
      "--chat-id",
      "chat-001",
      "--user-id",
      "user-001",
      "--requested-text",
      "把图片直接发给我",
      "--path",
      "/tmp/workspaces/main/output.png",
      "--media-kind",
      "image",
      "--title",
      "分析结果",
      "--caption",
      "本地生成图片",
    ]);

    expect(parsed).toEqual({
      ok: true,
      command: {
        actionType: "send",
        gatewayBaseUrl: "http://127.0.0.1:8787",
        workspace: "/tmp/workspaces/main",
        runId: "run-001",
        sessionId: "session-001",
        chatId: "chat-001",
        userId: "user-001",
        requestedText: "把图片直接发给我",
        invocation: {
          actionType: "send",
          sourceType: "local_path",
          path: "/tmp/workspaces/main/output.png",
          mediaKind: "image",
          title: "分析结果",
          caption: "本地生成图片",
        },
      },
    });
  });

  test("省略运行时 flags 时会从隐藏环境变量和 cwd 解析上下文", () => {
    const parsed = parseCarvisMediaCommand(
      [
        "send",
        "--url",
        "https://example.com/image.png",
      ],
      {
        cwd: "/tmp/workspaces/main",
        env: {
          CARVIS_SESSION_ID: "session-001",
          CARVIS_CHAT_ID: "chat-001",
          CARVIS_USER_ID: "user-001",
          CARVIS_RUN_ID: "run-001",
          CARVIS_REQUESTED_TEXT: "把图片直接发给我",
        },
      },
    );

    expect(parsed).toEqual({
      ok: true,
      command: expect.objectContaining({
        actionType: "send",
        gatewayBaseUrl: null,
        workspace: "/tmp/workspaces/main",
        runId: "run-001",
        sessionId: "session-001",
        chatId: "chat-001",
        userId: "user-001",
        requestedText: "把图片直接发给我",
        invocation: {
          actionType: "send",
          sourceType: "remote_url",
          url: "https://example.com/image.png",
        },
      }),
    });
  });

  test("会把显式 flag 中的 shell 变量字面量展开成环境变量值", () => {
    const previous = process.env.CARVIS_GATEWAY_BASE_URL;
    process.env.CARVIS_GATEWAY_BASE_URL = "http://127.0.0.1:8787";

    try {
      const parsed = parseCarvisMediaCommand([
        "send",
        "--gateway-base-url",
        "$CARVIS_GATEWAY_BASE_URL",
        "--workspace",
        "/tmp/workspaces/main",
        "--run-id",
        "run-001",
        "--session-id",
        "session-001",
        "--chat-id",
        "chat-001",
        "--requested-text",
        "把文件直接发给我",
        "--path",
        "/tmp/workspaces/main/report.pdf",
      ]);

      expect(parsed).toEqual({
        ok: true,
        command: {
          actionType: "send",
          gatewayBaseUrl: "http://127.0.0.1:8787",
          workspace: "/tmp/workspaces/main",
          runId: "run-001",
          sessionId: "session-001",
          chatId: "chat-001",
          userId: null,
          requestedText: "把文件直接发给我",
          invocation: {
            actionType: "send",
            sourceType: "local_path",
            path: "/tmp/workspaces/main/report.pdf",
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

  test("缺少 source 参数时返回 rejected", () => {
    expect(
      parseCarvisMediaCommand([
        "send",
        "--workspace",
        "/tmp/workspaces/main",
        "--run-id",
        "run-001",
        "--session-id",
        "session-001",
        "--chat-id",
        "chat-001",
        "--requested-text",
        "把图片直接发给我",
      ]),
    ).toEqual({
      ok: false,
      result: {
        status: "rejected",
        reason: "missing_source",
        mediaDeliveryId: null,
        targetRef: null,
        summary: "send 需要 --path 或 --url。",
      },
    });
  });

  test("缺少 transport 上下文时返回 missing_transport", () => {
    expect(
      parseCarvisMediaCommand(
        [
          "send",
          "--path",
          "/tmp/workspaces/main/output.png",
        ],
        {
          cwd: "/tmp/workspaces/main",
          env: {},
        },
      ),
    ).toEqual({
      ok: false,
      result: {
        status: "rejected",
        reason: "missing_transport",
        mediaDeliveryId: null,
        targetRef: null,
        summary: "当前会话内的资源发送能力不可用：缺少运行时上下文 runId。",
      },
    });
  });

  test("help 文案只暴露业务参数并把显式上下文标记为调试入口", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCarvisMediaCli(["--help"], {
      stdout(text) {
        stdout.push(text);
      },
      stderr(text) {
        stderr.push(text);
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain("Normal use only needs business arguments such as --path, --url, --media-kind, --title, and --caption.");
    expect(stdout.join("\n")).toContain("Debug flags are only for transport troubleshooting");
    expect(stdout.join("\n")).not.toContain("Runtime context is resolved internally from the current Codex session.");
  });

  test("gateway client 会把 runId 一并发送到 gateway", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const client = createCarvisMediaGatewayClient({
      fetchImpl: async (input, init) => {
        requests.push({
          url: String(input),
          body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
        });
        return new Response(
          JSON.stringify({
            ok: true,
            result: {
              status: "sent",
              reason: null,
              mediaDeliveryId: "media-001",
              targetRef: "img-key-001",
              summary: "已发送图片。",
            },
          }),
          { status: 200 },
        );
      },
    });

    await client.execute({
      actionType: "send",
      gatewayBaseUrl: "http://127.0.0.1:8787",
      workspace: "/tmp/workspaces/main",
      runId: "run-001",
      sessionId: "session-001",
      chatId: "chat-001",
      userId: "user-001",
      requestedText: "把图片直接发给我",
      invocation: {
        actionType: "send",
        sourceType: "local_path",
        path: "/tmp/workspaces/main/output.png",
        mediaKind: "image",
      },
    });

    expect(requests).toEqual([
      expect.objectContaining({
        url: "http://127.0.0.1:8787/internal/run-tools/execute",
        body: expect.objectContaining({
          toolName: "media.send",
          runId: "run-001",
          workspace: "/tmp/workspaces/main",
          sessionId: "session-001",
          chatId: "chat-001",
        }),
      }),
    ]);
  });

  test("stdout JSON 与 exit code 统一映射 sent rejected failed", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const results: MediaToolResult[] = [
      {
        status: "sent",
        reason: null,
        mediaDeliveryId: "media-001",
        targetRef: "om_xxx",
        summary: "已发送图片。",
      },
      {
        status: "rejected",
        reason: "invalid_context",
        mediaDeliveryId: null,
        targetRef: null,
        summary: "当前运行已结束，不能继续发送资源。",
      },
    ];

    let callIndex = 0;
    const gatewayClient = {
      async execute() {
        return results[callIndex++]!;
      },
    };

    const sentExitCode = await runCarvisMediaCli([
      "send",
      "--workspace",
      "/tmp/workspaces/main",
      "--run-id",
      "run-001",
      "--session-id",
      "session-001",
      "--chat-id",
      "chat-001",
      "--requested-text",
      "把图片直接发给我",
      "--path",
      "/tmp/workspaces/main/output.png",
    ], {
      gatewayClient,
      stdout(text) {
        stdout.push(text);
      },
      stderr(text) {
        stderr.push(text);
      },
    });

    const rejectedExitCode = await runCarvisMediaCli([
      "send",
      "--workspace",
      "/tmp/workspaces/main",
      "--run-id",
      "run-001",
      "--session-id",
      "session-001",
      "--chat-id",
      "chat-001",
      "--requested-text",
      "把图片直接发给我",
      "--path",
      "/tmp/workspaces/main/output.png",
    ], {
      gatewayClient,
      stdout(text) {
        stdout.push(text);
      },
      stderr(text) {
        stderr.push(text);
      },
    });

    globalThis.fetch = mock(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const failedStdout: string[] = [];
    const failedStderr: string[] = [];
    const failedExitCode = await runCarvisMediaCli([
      "send",
      "--gateway-base-url",
      "http://localhost",
      "--workspace",
      "/tmp/workspaces/main",
      "--run-id",
      "run-001",
      "--session-id",
      "session-001",
      "--chat-id",
      "chat-001",
      "--requested-text",
      "把图片直接发给我",
      "--path",
      "/tmp/workspaces/main/output.png",
    ], {
      stdout(text) {
        failedStdout.push(text);
      },
      stderr(text) {
        failedStderr.push(text);
      },
    });

    expect(sentExitCode).toBe(0);
    expect(JSON.parse(stdout[0] ?? "null")).toEqual(results[0]);
    expect(rejectedExitCode).toBe(3);
    expect(JSON.parse(stdout[1] ?? "null")).toEqual(results[1]);
    expect(stderr).toEqual([]);
    expect(failedExitCode).toBe(4);
    expect(failedStderr.at(-1)).toContain("network down");
    expect(JSON.parse(failedStdout.at(-1) ?? "null")).toEqual({
      status: "failed",
      reason: "transport_failure",
      mediaDeliveryId: null,
      targetRef: null,
      summary: expect.stringContaining("network down"),
    });
  });
});
