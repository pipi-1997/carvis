import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("feishu sandbox mode commands", () => {
  test("/mode 重复设置相同 mode 会刷新 override 有效期", async () => {
    const harness = createHarness();

    let response = await harness.postFeishuText("/mode danger-full-access", {
      chat_id: "chat-mode-renew",
      message_id: "msg-mode-renew-001",
      user_id: "user-001",
    });
    expect(response.status).toBe(200);

    const session = await harness.repositories.sessions.getSessionByChat("feishu", "chat-mode-renew");
    const firstOverride = await harness.repositories.chatSandboxOverrides.getOverrideBySessionId(session!.id);
    expect(firstOverride?.expiresAt).toBe("2026-03-08T00:30:00.000Z");

    harness.advanceTime(29 * 60 * 1_000);

    response = await harness.postFeishuText("/mode danger-full-access", {
      chat_id: "chat-mode-renew",
      message_id: "msg-mode-renew-002",
      user_id: "user-001",
    });
    expect(response.status).toBe(200);

    const renewedOverride = await harness.repositories.chatSandboxOverrides.getOverrideBySessionId(session!.id);
    expect(renewedOverride?.expiresAt).toBe("2026-03-08T00:59:00.000Z");
    expect(harness.sentMessages.at(-1)?.content).toContain("已更新");
  });

  test("/mode 设置、reset 和过期回退会影响后续普通消息", async () => {
    const harness = createHarness();

    let response = await harness.postFeishuText("/mode danger-full-access", {
      chat_id: "chat-mode",
      message_id: "msg-mode-001",
      user_id: "user-001",
    });
    expect(response.status).toBe(200);

    await harness.postFeishuText("第一条高权限消息", {
      chat_id: "chat-mode",
      message_id: "msg-mode-002",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    response = await harness.postFeishuText("/mode reset", {
      chat_id: "chat-mode",
      message_id: "msg-mode-003",
      user_id: "user-001",
    });
    expect(response.status).toBe(200);

    await harness.postFeishuText("回到默认模式", {
      chat_id: "chat-mode",
      message_id: "msg-mode-004",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    response = await harness.postFeishuText("/mode workspace-write", {
      chat_id: "chat-mode",
      message_id: "msg-mode-005",
      user_id: "user-001",
    });
    expect(response.status).toBe(200);
    harness.advanceTime(30 * 60 * 1_000 + 1);

    await harness.postFeishuText("override 过期后回退", {
      chat_id: "chat-mode",
      message_id: "msg-mode-006",
      user_id: "user-001",
    });
    await harness.executor.processNext();

    expect(harness.bridgeRequests.map((request) => ({
      messageId: request.triggerMessageId,
      resolvedSandboxMode: request.resolvedSandboxMode ?? null,
    }))).toEqual([
      {
        messageId: "msg-mode-002",
        resolvedSandboxMode: "danger-full-access",
      },
      {
        messageId: "msg-mode-004",
        resolvedSandboxMode: "workspace-write",
      },
      {
        messageId: "msg-mode-006",
        resolvedSandboxMode: "workspace-write",
      },
    ]);

    await harness.postFeishuText("/status", {
      chat_id: "chat-mode",
      message_id: "msg-mode-007",
      user_id: "user-001",
    });
    expect(harness.sentMessages.at(-1)?.content).toContain("sandbox override: 已过期");
  });

  test("/mode 非法参数返回帮助提示，不会作为普通 prompt 执行", async () => {
    const harness = createHarness();

    const response = await harness.postFeishuText("/mode invalid", {
      chat_id: "chat-mode-invalid",
      message_id: "msg-mode-invalid",
      user_id: "user-001",
    });
    expect(response.status).toBe(200);
    expect(await harness.repositories.runs.listRuns()).toHaveLength(0);
    expect(harness.sentMessages.at(-1)?.content).toContain("用法: /mode");
  });
});
