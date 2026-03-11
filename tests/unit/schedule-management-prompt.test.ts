import { describe, expect, test } from "bun:test";

import {
  createScheduleManagementPromptBuilder,
  parseOriginalScheduleUserPrompt,
} from "../../apps/gateway/src/services/schedule-management-prompt.ts";

describe("schedule management prompt", () => {
  test("会为所有 run 暴露 carvis-schedule CLI capability，并保留原始用户请求", () => {
    const builder = createScheduleManagementPromptBuilder();
    const prompt = builder.build({
      workspace: "/tmp/managed/main",
      userPrompt: "每天早上 9 点帮我检查构建失败并总结",
    });

    expect(prompt).toContain("If the user wants to create, list, update, disable, or otherwise manage schedules or reminders");
    expect(prompt).toContain("If the user is not managing schedules, answer normally and do not call carvis-schedule.");
    expect(prompt).toContain("use the local carvis-schedule CLI");
    expect(prompt).toContain("carvis-schedule create");
    expect(prompt).toContain("resolves the current runtime context internally");
    expect(prompt).toContain("Current workspace: /tmp/managed/main");
    expect(prompt).not.toContain("Return exactly one JSON object and no prose.");
    expect(prompt).not.toContain("MCP tools");
    expect(prompt).not.toContain("schedule.create");
    expect(prompt).not.toContain("Current gateway base URL:");
    expect(parseOriginalScheduleUserPrompt(prompt)).toBe("每天早上 9 点帮我检查构建失败并总结");
  });
});
