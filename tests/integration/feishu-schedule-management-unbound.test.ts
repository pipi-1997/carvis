import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("Feishu schedule management unbound integration", () => {
  test("群聊未绑定 workspace 时 schedule intent 返回 bind 引导且不写入管理状态", async () => {
    const harness = createHarness();

    const response = await harness.postFeishuText("每天早上 9 点帮我检查构建失败", {
      chat_id: "chat-group-001",
      chat_type: "group",
      message_id: "msg-group-001",
      user_id: "user-group-001",
    });

    expect(response.status).toBe(200);
    expect(harness.sentMessages.at(-1)?.content).toContain("/bind <workspace-key>");
    expect(await harness.repositories.runs.listRuns()).toHaveLength(0);
    expect(await harness.repositories.scheduleManagementActions.listActions()).toHaveLength(0);
  });
});
