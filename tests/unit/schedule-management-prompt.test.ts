import { describe, expect, test } from "bun:test";

import {
  createScheduleManagementPromptBuilder,
  parseOriginalScheduleUserPrompt,
} from "../../apps/gateway/src/services/schedule-management-prompt.ts";

describe("schedule management prompt", () => {
  test("会为所有 run 暴露 schedule 与 media capability，并保留原始用户请求", () => {
    const builder = createScheduleManagementPromptBuilder();
    const prompt = builder.build({
      workspace: "/tmp/managed/main",
      userPrompt: "每天早上 9 点帮我检查构建失败并总结",
    });

    expect(prompt).toContain("If the user wants a file or image delivered back to the current chat as a real resource, use carvis-media send.");
    expect(
      prompt.indexOf("If the user wants a file or image delivered back to the current chat as a real resource, use carvis-media send."),
    ).toBeLessThan(
      prompt.indexOf("If the user wants to create, list, update, disable, enable, or otherwise manage schedules or reminders"),
    );
    expect(prompt).toContain("Example: if the user says '把截图发给我', call carvis-media send --path <path> --media-kind image.");
    expect(prompt).toContain("Example: if the user says '把这个文件直接发出来', call carvis-media send --path <path> --media-kind file.");
    expect(prompt).toContain("Try carvis-media send once. If that attempt fails, stop and tell the user media delivery is currently unavailable.");
    expect(prompt).toContain("Do not debug PATH, worktree, bun, or runId unless the user explicitly asks you to.");
    expect(prompt).toContain("Do not search the repo, switch worktrees, or wrap the command with bun after a failed send attempt.");
    expect(prompt).toContain("Do not pass runtime context flags like --gateway-base-url, --workspace, --session-id, --chat-id, or --requested-text unless you are explicitly debugging transport wiring.");
    expect(prompt).not.toContain("carvis-media already resolves the current runtime context internally in this session.");
    expect(prompt).toContain("If the user wants to create, list, update, disable, enable, or otherwise manage schedules or reminders");
    expect(prompt).toContain("If the user is not managing schedules, answer normally and do not call carvis-schedule.");
    expect(prompt).toContain("use the local carvis-schedule CLI");
    expect(prompt).toContain("carvis-schedule create");
    expect(prompt).toContain("carvis-schedule enable");
    expect(prompt).toContain("Current workspace: /tmp/managed/main");
    expect(prompt).not.toContain("Return exactly one JSON object and no prose.");
    expect(prompt).not.toContain("MCP tools");
    expect(prompt).not.toContain("schedule.create");
    expect(prompt).not.toContain("Current gateway base URL:");
    expect(parseOriginalScheduleUserPrompt(prompt)).toBe("每天早上 9 点帮我检查构建失败并总结");
  });
});
