import { describe, expect, test } from "bun:test";

import { formatTerminalResultMessage } from "../../apps/gateway/src/services/terminal-result-renderer.ts";

describe("terminal result renderer", () => {
  test("普通完成态总结优先保留 agent 原始结构，不强制包四段式章节", () => {
    const message = formatTerminalResultMessage({
      runId: "run-1",
      headline: "已完成",
      conclusion: "这是 agent 的自然回答。\n\n- 第一条\n- 第二条",
      changes: ["不应自动注入"],
      verification: ["不应自动注入"],
      nextSteps: ["不应自动注入"],
      status: "completed",
    });

    expect(message.title).toBe("已完成");
    expect(message.content).toBe("这是 agent 的自然回答。\n\n- 第一条\n- 第二条");
  });

  test("已结构化的四段式总结不会在终态卡片中重复包裹一层章节", () => {
    const message = formatTerminalResultMessage({
      runId: "run-1",
      headline: "已完成",
      conclusion: [
        "**结论**",
        "- 已完成仓库检查",
        "",
        "**主要变更**",
        "- 更新了 presentation-orchestrator.ts",
        "",
        "**验证**",
        "- bun test",
        "",
        "**下一步**",
        "- 继续验收",
      ].join("\n"),
      changes: ["不应重复渲染"],
      verification: ["不应重复渲染"],
      nextSteps: ["不应重复渲染"],
      status: "completed",
    });

    expect(message.title).toBe("已完成");
    expect(message.content).toContain("**结论**");
    expect(message.content).toContain("**主要变更**");
    expect(message.content).not.toContain("## 结论");
    expect(message.content).not.toContain("不应重复渲染");
  });
});
