import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { runCarvisMediaCli } from "../../packages/carvis-media-cli/src/index.ts";
import { createHarness } from "../support/harness.ts";

const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));
const CARVIS_MEDIA_BIN = join(
  ROOT_DIR,
  "packages",
  "carvis-media-cli",
  "bin",
  "carvis-media.cjs",
);
const CARVIS_MEDIA_BIN_DIR = join(
  ROOT_DIR,
  "packages",
  "carvis-media-cli",
  "bin",
);

function createHarnessFetch(harness: ReturnType<typeof createHarness>) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const requestUrl = typeof input === "string" || input instanceof URL
      ? String(input)
      : input.url;
    return await harness.gateway.request(requestUrl, init);
  };
}

async function executeCli(
  harness: ReturnType<typeof createHarness>,
  argv: string[],
  options?: {
    env?: Record<string, string | undefined>;
  },
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCarvisMediaCli(argv, {
    fetchImpl: createHarnessFetch(harness),
    env: options?.env,
    stdout(text) {
      stdout.push(text);
    },
    stderr(text) {
      stderr.push(text);
    },
  });

  return {
    exitCode,
    stdout: JSON.parse(stdout.at(-1) ?? "null") as Record<string, unknown>,
    stderr,
  };
}

describe("carvis-media cli contract", () => {
  test("send 缺少 transport 上下文时返回 missing_transport + exit 3", async () => {
    const harness = createHarness();

    const result = await executeCli(harness, [
      "send",
      "--gateway-base-url",
      "http://localhost",
      "--workspace",
      harness.agentConfig.workspace,
      "--requested-text",
      "把图片直接发给我",
      "--path",
      `${harness.agentConfig.workspace}/output.png`,
    ], {
      env: {},
    });

    expect(result.exitCode).toBe(3);
    expect(result.stdout).toMatchObject({
      status: "rejected",
      reason: "missing_transport",
      summary: "当前会话内的资源发送能力不可用：缺少运行时上下文 runId。",
    });
  });

  test("真实 CLI 路径会使用当前 run 上下文把文件发回当前 session", async () => {
    const workspace = harnessWorkspace();
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-media-cli-contract",
      },
    });
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: harness.agentConfig,
    });
    const queuedRun = await harness.repositories.runs.createQueuedRun({
      sessionId: session.id,
      agentId: harness.agentConfig.id,
      workspace,
      prompt: "请把 README 直接发给我",
      triggerMessageId: "msg-001",
      triggerUserId: "user-001",
      timeoutSeconds: harness.agentConfig.timeoutSeconds,
    });
    const run = await harness.repositories.runs.markRunStarted(queuedRun.id, new Date().toISOString());
    writeFileSync(join(workspace, "README.md"), "# cli media\n");

    const server = Bun.serve({
      port: 0,
      fetch: harness.gateway.fetch,
    });

    try {
      const command = Bun.spawn(
        [
          process.execPath,
          CARVIS_MEDIA_BIN,
          "send",
          "--path",
          join(workspace, "README.md"),
          "--media-kind",
          "file",
        ],
        {
          cwd: workspace,
          env: {
            ...process.env,
            CARVIS_GATEWAY_BASE_URL: `http://127.0.0.1:${server.port}`,
            CARVIS_WORKSPACE: workspace,
            CARVIS_RUN_ID: run.id,
            CARVIS_SESSION_ID: session.id,
            CARVIS_CHAT_ID: session.chatId,
            CARVIS_USER_ID: "user-001",
            CARVIS_REQUESTED_TEXT: "请把 README 直接发给我",
          },
        },
      );

      const exitCode = await command.exited;
      const stdout = await new Response(command.stdout).text();
      const stderr = await new Response(command.stderr).text();
      expect(stderr).toBe("");
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout.trim())).toMatchObject({
        status: "sent",
        reason: null,
      });
      expect(await harness.repositories.runMediaDeliveries.listMediaDeliveries()).toEqual([
        expect.objectContaining({
          runId: run.id,
          sessionId: session.id,
          chatId: session.chatId,
          status: "sent",
        }),
      ]);
    } finally {
      server.stop(true);
    }
  });

  test("bin 目录进入 PATH 后可直接通过 carvis-media 命令名执行", async () => {
    const workspace = harnessWorkspace();
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-media-cli-contract",
      },
    });
    const session = await harness.repositories.sessions.getOrCreateSession({
      channel: "feishu",
      chatId: "chat-001",
      agentConfig: harness.agentConfig,
    });
    const queuedRun = await harness.repositories.runs.createQueuedRun({
      sessionId: session.id,
      agentId: harness.agentConfig.id,
      workspace,
      prompt: "请把 README 直接发给我",
      triggerMessageId: "msg-001",
      triggerUserId: "user-001",
      timeoutSeconds: harness.agentConfig.timeoutSeconds,
    });
    const run = await harness.repositories.runs.markRunStarted(queuedRun.id, new Date().toISOString());
    writeFileSync(join(workspace, "README.md"), "# cli media\n");

    const server = Bun.serve({
      port: 0,
      fetch: harness.gateway.fetch,
    });

    try {
      const command = Bun.spawn(
        [
          "carvis-media",
          "send",
          "--path",
          join(workspace, "README.md"),
          "--media-kind",
          "file",
        ],
        {
          cwd: workspace,
          env: {
            ...process.env,
            PATH: `${CARVIS_MEDIA_BIN_DIR}:${process.env.PATH ?? ""}`,
            CARVIS_GATEWAY_BASE_URL: `http://127.0.0.1:${server.port}`,
            CARVIS_WORKSPACE: workspace,
            CARVIS_RUN_ID: run.id,
            CARVIS_SESSION_ID: session.id,
            CARVIS_CHAT_ID: session.chatId,
            CARVIS_USER_ID: "user-001",
            CARVIS_REQUESTED_TEXT: "请把 README 直接发给我",
          },
        },
      );

      const exitCode = await command.exited;
      const stdout = await new Response(command.stdout).text();
      const stderr = await new Response(command.stderr).text();
      expect(stderr).toBe("");
      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout.trim())).toMatchObject({
        status: "sent",
        reason: null,
      });
    } finally {
      server.stop(true);
    }
  });
});

function harnessWorkspace() {
  return "/tmp/carvis-managed-workspaces-media-cli-contract/main";
}
