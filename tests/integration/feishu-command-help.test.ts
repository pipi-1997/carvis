import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("feishu command help", () => {
  test("群聊带 mention 的 /bind 会命中命令路由而不是创建普通 run", async () => {
    const harness = createHarness();

    const response = await harness.postFeishuText("@carvis /bind life-okr", {
      chat_id: "chat-life",
      chat_type: "group",
      message_id: "msg-001",
      user_id: "user-001",
      mentions: [{ name: "carvis" }],
    });

    expect(response.status).toBe(200);
    expect(await harness.repositories.runs.listRuns()).toHaveLength(0);

    const session = await harness.repositories.sessions.getSessionByChat("feishu", "chat-life");
    const binding = await harness.repositories.sessionWorkspaceBindings.getBindingBySessionId(session!.id);
    expect(binding).toMatchObject({
      workspaceKey: "life-okr",
      bindingSource: "created",
    });
  });

  test("/help 会返回命令列表和私聊/群聊输入说明", async () => {
    const harness = createHarness();

    const response = await harness.postFeishuText("/help", {
      chat_id: "p2p-help",
      chat_type: "p2p",
      message_id: "msg-help",
      user_id: "user-001",
    });

    expect(response.status).toBe(200);
    expect(await harness.repositories.runs.listRuns()).toHaveLength(0);
    expect(harness.sentMessages.at(-1)?.content).toContain("/bind <workspace-key>");
    expect(harness.sentMessages.at(-1)?.content).toContain("/status");
    expect(harness.sentMessages.at(-1)?.content).toContain("私聊");
    expect(harness.sentMessages.at(-1)?.content).toContain("群聊");
  });

  test("未知 slash 命令会返回帮助提示而不是触发 agent 运行", async () => {
    const harness = createHarness();

    const response = await harness.postFeishuText("/bindd life-okr", {
      chat_id: "p2p-unknown",
      chat_type: "p2p",
      message_id: "msg-unknown",
      user_id: "user-001",
    });

    expect(response.status).toBe(200);
    expect(await harness.repositories.runs.listRuns()).toHaveLength(0);
    expect(harness.sentMessages.at(-1)?.content).toContain("未知命令");
    expect(harness.sentMessages.at(-1)?.content).toContain("/help");
  });
});
