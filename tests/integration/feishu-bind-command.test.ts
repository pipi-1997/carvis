import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { CodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { createHarness } from "../support/harness.ts";

describe("feishu bind command", () => {
  test("绑定已有 registry workspace 会建立 manual binding", async () => {
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: "/tmp/carvis-workspace",
          ops: "/tmp/carvis-ops-workspace",
        },
      },
    });

    const response = await harness.postFeishuText("/bind ops", {
      chat_id: "chat-ops",
      chat_type: "group",
      message_id: "msg-001",
      user_id: "user-001",
    });

    expect(response.status).toBe(200);
    const session = await harness.repositories.sessions.getSessionByChat("feishu", "chat-ops");
    expect(session).not.toBeNull();
    const binding = await harness.repositories.sessionWorkspaceBindings.getBindingBySessionId(session!.id);
    expect(binding).toMatchObject({
      workspaceKey: "ops",
      bindingSource: "manual",
    });
    expect(harness.sentMessages.at(-1)?.content).toContain("已绑定 workspace: ops");
  });

  test("绑定不存在的 workspace key 会按 template 创建并绑定", async () => {
    const harness = createHarness();

    const response = await harness.postFeishuText("/bind feature-a", {
      chat_id: "chat-create",
      chat_type: "group",
      message_id: "msg-001",
      user_id: "user-001",
    });

    expect(response.status).toBe(200);
    const session = await harness.repositories.sessions.getSessionByChat("feishu", "chat-create");
    expect(session).not.toBeNull();
    const binding = await harness.repositories.sessionWorkspaceBindings.getBindingBySessionId(session!.id);
    expect(binding).toMatchObject({
      workspaceKey: "feature-a",
      bindingSource: "created",
    });
    expect(harness.logger.listEntries()).toContainEqual({
      level: "info",
      message: "workspace.bind.created",
      context: expect.objectContaining({
        chatId: "chat-create",
        status: "created",
        workspaceKey: "feature-a",
      }),
    });
    const catalogEntry = await harness.repositories.workspaceCatalog.getEntryByWorkspaceKey("feature-a");
    expect(catalogEntry?.workspacePath).toBe(join(harness.workspaceResolverConfig.managedWorkspaceRoot, "feature-a"));
  });

  test("template 缺失时拒绝创建并保留当前 binding", async () => {
    const harness = createHarness();
    rmSync(harness.workspaceResolverConfig.templatePath, {
      force: true,
      recursive: true,
    });

    const response = await harness.postFeishuText("/bind feature-b", {
      chat_id: "chat-template-missing",
      chat_type: "group",
      message_id: "msg-001",
      user_id: "user-001",
    });

    expect(response.status).toBe(200);
    expect(harness.sentMessages.at(-1)?.content).toContain("template");
    const runs = await harness.repositories.runs.listRuns();
    expect(runs).toHaveLength(0);
  });

  test("托管根目录不可写时拒绝创建并返回清晰提示", async () => {
    const harness = createHarness();
    rmSync(harness.workspaceResolverConfig.managedWorkspaceRoot, {
      force: true,
      recursive: true,
    });
    writeFileSync(harness.workspaceResolverConfig.managedWorkspaceRoot, "not-a-directory");

    const response = await harness.postFeishuText("/bind feature-c", {
      chat_id: "chat-managed-root-file",
      chat_type: "group",
      message_id: "msg-001",
      user_id: "user-001",
    });

    expect(response.status).toBe(200);
    expect(harness.sentMessages.at(-1)?.content).toContain("workspace");
    expect(await harness.repositories.workspaceCatalog.getEntryByWorkspaceKey("feature-c")).toBeNull();
  });

  test("当前 session 存在 active run 时拒绝切换到另一个 workspace", async () => {
    const harness = createHarness({
      transportScript: [{ type: "wait-for-cancel" }],
      workspaceResolver: {
        registry: {
          main: "/tmp/carvis-workspace",
          ops: "/tmp/carvis-ops-workspace",
        },
        chatBindings: {
          "chat-ops": "ops",
        },
      },
    });

    await harness.postFeishuText("帮我检查发布日志", {
      chat_id: "chat-ops",
      chat_type: "group",
      message_id: "msg-001",
      user_id: "user-001",
    });
    const activeRunPromise = harness.executor.processNext();
    await harness.waitForRunStatus("running");

    const response = await harness.postFeishuText("/bind main", {
      chat_id: "chat-ops",
      chat_type: "group",
      message_id: "msg-002",
      user_id: "user-001",
    });

    expect(response.status).toBe(200);
    expect(harness.sentMessages.at(-1)?.content).toContain("当前运行结束");
    const session = await harness.repositories.sessions.getSessionByChat("feishu", "chat-ops");
    const binding = await harness.repositories.sessionWorkspaceBindings.getBindingBySessionId(session!.id);
    expect(binding).toMatchObject({
      workspaceKey: "ops",
      bindingSource: "config",
    });
    expect(harness.logger.listEntries()).toContainEqual({
      level: "warn",
      message: "workspace.bind.rejected_active_run",
      context: expect.objectContaining({
        chatId: "chat-ops",
        status: "rejected_active_run",
        workspaceKey: "main",
      }),
    });

    await harness.cancelSignals.requestCancellation((await harness.repositories.runs.listRuns())[0].id);
    await activeRunPromise;
  });

  test("其他 session 在默认 workspace 运行时，当前 session 仍可切换 workspace", async () => {
    const harness = createHarness({
      transportScript: [{ type: "wait-for-cancel" }],
      workspaceResolver: {
        registry: {
          main: "/tmp/carvis-workspace",
          ops: "/tmp/carvis-ops-workspace",
        },
      },
    });

    await harness.postFeishuText("运行默认 workspace 长任务", {
      chat_id: "p2p-running",
      chat_type: "p2p",
      message_id: "msg-run",
      user_id: "user-001",
    });
    const activeRunPromise = harness.executor.processNext();
    await harness.waitForRunStatus("running");

    const response = await harness.postFeishuText("/bind ops", {
      chat_id: "p2p-switch",
      chat_type: "p2p",
      message_id: "msg-bind",
      user_id: "user-002",
    });

    expect(response.status).toBe(200);
    expect(harness.sentMessages.at(-1)?.content).toContain("已绑定 workspace: ops");
    const session = await harness.repositories.sessions.getSessionByChat("feishu", "p2p-switch");
    const binding = await harness.repositories.sessionWorkspaceBindings.getBindingBySessionId(session!.id);
    expect(binding).toMatchObject({
      workspaceKey: "ops",
      bindingSource: "manual",
    });

    await harness.cancelSignals.requestCancellation((await harness.repositories.runs.listRuns())[0].id);
    await activeRunPromise;
  });

  test("path-like workspace key 会被拒绝，不会创建越界目录", async () => {
    const harness = createHarness();

    const response = await harness.postFeishuText("/bind ../escape", {
      chat_id: "chat-invalid-bind",
      chat_type: "group",
      message_id: "msg-invalid-bind",
      user_id: "user-001",
    });

    expect(response.status).toBe(200);
    expect(harness.sentMessages.at(-1)?.kind).toBe("error");
    expect(harness.sentMessages.at(-1)?.content).toContain("workspace key");
    expect(await harness.repositories.workspaceCatalog.getEntryByWorkspaceKey("../escape")).toBeNull();
  });

  test("/bind 切换 workspace 后会重置续聊绑定，后续 prompt 强制 fresh", async () => {
    const transport: CodexTransport = {
      async *run(request) {
        if (request.triggerMessageId === "msg-001") {
          yield {
            type: "result",
            resultSummary: "已建立 ops 上下文",
            bridgeSessionId: "thread-ops",
            sessionOutcome: "created",
          };
          return;
        }

        yield {
          type: "result",
          resultSummary: "切换 workspace 后重新开始",
          bridgeSessionId: "thread-main",
          sessionOutcome: "created",
        };
      },
    };
    const harness = createHarness({
      transport,
      workspaceResolver: {
        registry: {
          main: "/tmp/carvis-workspace",
          ops: "/tmp/carvis-ops-workspace",
        },
      },
    });

    await harness.postFeishuText("/bind ops", {
      chat_id: "chat-switch",
      chat_type: "group",
      message_id: "msg-bind-001",
      user_id: "user-001",
    });

    await harness.postFeishuText("先在 ops 建立上下文", {
      chat_id: "chat-switch",
      chat_type: "group",
      message_id: "msg-001",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    const session = await harness.repositories.sessions.getSessionByChat("feishu", "chat-switch");
    const bindingBeforeSwitch = await harness.repositories.conversationSessionBindings.getBindingBySessionId(session!.id);
    expect(bindingBeforeSwitch?.workspace).toBe("/tmp/carvis-ops-workspace");

    const switchResponse = await harness.postFeishuText("/bind main", {
      chat_id: "chat-switch",
      chat_type: "group",
      message_id: "msg-bind-002",
      user_id: "user-001",
    });
    expect(switchResponse.status).toBe(200);

    const bindingAfterSwitch = await harness.repositories.conversationSessionBindings.getBindingBySessionId(session!.id);
    expect(bindingAfterSwitch).toMatchObject({
      bridgeSessionId: null,
      mode: "fresh",
      status: "reset",
    });

    await harness.postFeishuText("切到 main 后的新问题", {
      chat_id: "chat-switch",
      chat_type: "group",
      message_id: "msg-002",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    expect(harness.bridgeRequests.map((request) => ({
      messageId: request.triggerMessageId,
      sessionMode: request.sessionMode ?? "fresh",
      bridgeSessionId: request.bridgeSessionId ?? null,
      workspace: request.workspace,
    }))).toEqual([
      {
        messageId: "msg-001",
        sessionMode: "fresh",
        bridgeSessionId: null,
        workspace: "/tmp/carvis-ops-workspace",
      },
      {
        messageId: "msg-002",
        sessionMode: "fresh",
        bridgeSessionId: null,
        workspace: "/tmp/carvis-workspace",
      },
    ]);
  });
});
