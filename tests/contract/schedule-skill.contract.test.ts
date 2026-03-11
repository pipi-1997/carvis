import { describe, expect, test } from "bun:test";

import { createHarness } from "../support/harness.ts";

describe("schedule skill contract", () => {
  test("普通对话保持普通 run 模式，但默认暴露 carvis-schedule CLI prompt", async () => {
    const harness = createHarness();

    const response = await harness.postFeishuText("帮我分析一下这个仓库的目标");
    expect(response.status).toBe(202);

    const runs = await harness.repositories.runs.listRuns();
    expect(runs[0]?.managementMode).toBe("none");
    expect(runs[0]?.prompt).toContain("use the local carvis-schedule CLI");
    expect(runs[0]?.prompt).toContain("resolves the current runtime context internally");
    expect(runs[0]?.prompt).not.toContain('--gateway-base-url "$CARVIS_GATEWAY_BASE_URL"');
    expect(runs[0]?.prompt).toContain('Original user request JSON: "帮我分析一下这个仓库的目标"');
  });

  test("提醒类表达不依赖 detector，也会把 schedule capability 暴露给 agent", async () => {
    const workspace = "/tmp/carvis-managed-workspaces-skill-contract/main";
    const harness = createHarness({
      workspaceResolver: {
        registry: {
          main: workspace,
        },
        managedWorkspaceRoot: "/tmp/carvis-managed-workspaces-skill-contract",
      },
    });

    const response = await harness.postFeishuText("明天上午 9 点提醒我 real chat verify");
    expect(response.status).toBe(202);

    const runs = await harness.repositories.runs.listRuns();
    expect(runs[0]?.managementMode).toBe("none");
    expect(runs[0]?.prompt).toContain("use the local carvis-schedule CLI");
    expect(runs[0]?.prompt).toContain("resolves the current runtime context internally");
    expect(runs[0]?.prompt).not.toContain('--chat-id "$CARVIS_CHAT_ID"');
    expect(runs[0]?.prompt).toContain('Original user request JSON: "明天上午 9 点提醒我 real chat verify"');
  });
});
