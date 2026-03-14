import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("feishu sandbox mode default integration", () => {
  test("普通飞书消息按目标 workspace 默认 sandbox mode 执行", async () => {
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: "/tmp/carvis-main-workspace",
          ops: "/tmp/carvis-ops-workspace",
        },
        chatBindings: {
          "chat-ops": "ops",
        },
        sandboxModes: {
          main: "workspace-write",
          ops: "danger-full-access",
        },
      },
    });

    const response = await harness.postFeishuText("请检查当前仓库", {
      chat_id: "chat-ops",
      chat_type: "group",
      message_id: "msg-ops-001",
    });
    expect(response.status).toBe(202);

    const queuedRun = (await harness.repositories.runs.listRuns()).at(-1);
    expect(queuedRun).toMatchObject({
      resolvedSandboxMode: "danger-full-access",
      sandboxModeSource: "workspace_default",
    });

    await harness.executor.processNext();

    expect(harness.bridgeRequests.at(-1)).toMatchObject({
      resolvedSandboxMode: "danger-full-access",
      workspace: "/tmp/carvis-ops-workspace",
    });
  });
});
