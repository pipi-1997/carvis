import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("feishu workspace routing", () => {
  test("private chat 普通消息默认解析到 default workspace", async () => {
    const harness = createHarness();

    const response = await harness.postFeishuText("帮我总结仓库目标", {
      chat_id: "p2p-001",
      chat_type: "p2p",
      message_id: "msg-001",
      user_id: "user-001",
    });

    expect(response.status).toBe(202);
    const session = await harness.repositories.sessions.getSessionByChat("feishu", "p2p-001");
    expect(session).not.toBeNull();
    const binding = await harness.repositories.sessionWorkspaceBindings.getBindingBySessionId(session!.id);
    expect(binding).toMatchObject({
      workspaceKey: "main",
      bindingSource: "default",
    });
    expect(harness.logger.listEntries()).toContainEqual({
      level: "info",
      message: "workspace.resolution.default",
      context: expect.objectContaining({
        chatId: "p2p-001",
        status: "default",
        trigger: "prompt",
        workspaceKey: "main",
      }),
    });
    const run = await harness.repositories.runs.getLatestRunByChat("feishu", "p2p-001");
    expect(run?.workspace).toBe(harness.agentConfig.workspace);
  });

  test("unbound group chat 普通消息不会创建 run 或进入队列", async () => {
    const harness = createHarness();

    const response = await harness.postFeishuText("帮我总结仓库目标", {
      chat_id: "chat-unbound",
      chat_type: "group",
      message_id: "msg-001",
      user_id: "user-001",
    });

    expect(response.status).toBe(200);
    expect(await harness.repositories.runs.listRuns()).toHaveLength(0);
    expect(harness.sentMessages.at(-1)?.content).toContain("未绑定 workspace");
    expect(harness.logger.listEntries()).toContainEqual({
      level: "warn",
      message: "workspace.resolution.unbound",
      context: expect.objectContaining({
        chatId: "chat-unbound",
        status: "unbound",
        trigger: "prompt",
      }),
    });
  });

  test("group chat 命中静态 chatBindings 时使用映射 workspace 执行", async () => {
    const harness = createHarness({
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

    const response = await harness.postFeishuText("帮我检查发布日志", {
      chat_id: "chat-ops",
      chat_type: "group",
      message_id: "msg-001",
      user_id: "user-001",
    });

    expect(response.status).toBe(202);
    const session = await harness.repositories.sessions.getSessionByChat("feishu", "chat-ops");
    expect(session).not.toBeNull();
    const binding = await harness.repositories.sessionWorkspaceBindings.getBindingBySessionId(session!.id);
    expect(binding).toMatchObject({
      workspaceKey: "ops",
      bindingSource: "config",
    });
    const run = await harness.repositories.runs.getLatestRunByChat("feishu", "chat-ops");
    expect(run?.workspace).toBe("/tmp/carvis-ops-workspace");
  });
});
