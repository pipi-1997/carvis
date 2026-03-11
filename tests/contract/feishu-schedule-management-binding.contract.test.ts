import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("Feishu schedule management binding contract", () => {
  test("未绑定 workspace 的 schedule intent 必须返回 bind 引导且不得写入管理状态", async () => {
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
    expect(await harness.repositories.triggerDefinitions.listDefinitions()).toHaveLength(0);
    expect(await harness.repositories.triggerDefinitionOverrides.listOverrides()).toHaveLength(0);
    expect(await harness.repositories.scheduleManagementActions.listActions()).toHaveLength(0);
  });
});
