import { describe, expect, test } from "bun:test";

import { runCarvisScheduleCli } from "../../packages/carvis-schedule-cli/src/index.ts";
import { createHarness } from "../support/harness.ts";

function createHarnessFetch(harness: ReturnType<typeof createHarness>) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const requestUrl = typeof input === "string" || input instanceof URL
      ? String(input)
      : input.url;
    return await harness.gateway.request(requestUrl, init);
  };
}

async function executeCli(
  harness: ReturnType<typeof createHarness>,
  argv: string[],
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCarvisScheduleCli(argv, {
    fetchImpl: createHarnessFetch(harness),
    stdout(text) {
      stdout.push(text);
    },
    stderr(text) {
      stderr.push(text);
    },
  });

  return {
    exitCode,
    stdout: JSON.parse(stdout.at(-1) ?? "null") as Record<string, unknown>,
    stderr,
  };
}

describe("carvis-schedule cli contract", () => {
  test("create 通过 gateway durable 创建 definition 并返回 executed + exit 0", async () => {
    const harness = createHarness();

    const result = await executeCli(harness, [
      "create",
      "--gateway-base-url",
      "http://localhost",
      "--workspace",
      harness.agentConfig.workspace,
      "--session-id",
      "session-001",
      "--chat-id",
      "chat-001",
      "--user-id",
      "user-001",
      "--requested-text",
      "明天上午 9 点提醒我 real chat verify",
      "--label",
      "real chat verify",
      "--schedule-expr",
      "0 9 12 3 *",
      "--timezone",
      "Asia/Shanghai",
      "--prompt-template",
      "real chat verify",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatchObject({
      status: "executed",
      reason: null,
    });
    expect(await harness.repositories.triggerDefinitions.listDefinitions()).toEqual([
      expect.objectContaining({
        workspace: harness.agentConfig.workspace,
        definitionOrigin: "agent",
        scheduleExpr: "0 9 12 3 *",
      }),
    ]);
  });

  test("list 返回当前 workspace 的 effective schedules", async () => {
    const harness = createHarness({
      triggerConfig: {
        scheduledJobs: [
          {
            id: "daily-report",
            enabled: true,
            workspace: "main",
            agentId: "codex-main",
            schedule: "0 9 * * *",
            timezone: "Asia/Shanghai",
            promptTemplate: "生成日报",
            delivery: {
              kind: "none",
            },
          },
        ],
      },
    });
    await harness.triggerDefinitionSync.syncDefinitions();

    const result = await executeCli(harness, [
      "list",
      "--gateway-base-url",
      "http://localhost",
      "--workspace",
      harness.agentConfig.workspace,
      "--session-id",
      "session-001",
      "--chat-id",
      "chat-001",
      "--requested-text",
      "列出定时任务",
    ]);

    expect(result.exitCode).toBe(0);
    expect(String(result.stdout.summary ?? "")).toContain("daily-report");
    expect(String(result.stdout.summary ?? "")).toContain("config");
    expect(result.stdout.schedules).toEqual([
      expect.objectContaining({
        definitionId: "daily-report",
        definitionOrigin: "config",
        enabled: true,
        scheduleExpr: "0 9 * * *",
      }),
    ]);
  });

  test("update 命中多个目标时返回 needs_clarification + exit 2", async () => {
    const harness = createHarness({
      triggerConfig: {
        scheduledJobs: [
          {
            id: "daily-report-am",
            enabled: true,
            workspace: "main",
            agentId: "codex-main",
            schedule: "0 9 * * *",
            timezone: "Asia/Shanghai",
            promptTemplate: "生成日报",
            delivery: { kind: "none" },
          },
          {
            id: "daily-report-pm",
            enabled: true,
            workspace: "main",
            agentId: "codex-main",
            schedule: "0 18 * * *",
            timezone: "Asia/Shanghai",
            promptTemplate: "生成日报",
            delivery: { kind: "none" },
          },
        ],
      },
    });
    await harness.triggerDefinitionSync.syncDefinitions();

    const result = await executeCli(harness, [
      "update",
      "--gateway-base-url",
      "http://localhost",
      "--workspace",
      harness.agentConfig.workspace,
      "--session-id",
      "session-001",
      "--chat-id",
      "chat-001",
      "--requested-text",
      "把日报改成 10 点",
      "--target-reference",
      "日报",
      "--schedule-expr",
      "0 10 * * *",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toMatchObject({
      status: "needs_clarification",
      reason: "ambiguous_target",
    });
  });

  test("disable 找不到目标时返回 rejected + exit 3", async () => {
    const harness = createHarness();

    const result = await executeCli(harness, [
      "disable",
      "--gateway-base-url",
      "http://localhost",
      "--workspace",
      harness.agentConfig.workspace,
      "--session-id",
      "session-001",
      "--chat-id",
      "chat-001",
      "--requested-text",
      "停用日报",
      "--target-reference",
      "日报",
    ]);

    expect(result.exitCode).toBe(3);
    expect(result.stdout).toMatchObject({
      status: "rejected",
      reason: "target_not_found",
    });
  });

  test("enable 命中唯一目标时返回 executed + exit 0", async () => {
    const harness = createHarness({
      triggerConfig: {
        scheduledJobs: [
          {
            id: "daily-report",
            enabled: false,
            workspace: "main",
            agentId: "codex-main",
            schedule: "0 9 * * *",
            timezone: "Asia/Shanghai",
            promptTemplate: "生成日报",
            delivery: { kind: "none" },
          },
        ],
      },
    });
    await harness.triggerDefinitionSync.syncDefinitions();

    const result = await executeCli(harness, [
      "enable",
      "--gateway-base-url",
      "http://localhost",
      "--workspace",
      harness.agentConfig.workspace,
      "--session-id",
      "session-001",
      "--chat-id",
      "chat-001",
      "--requested-text",
      "启用日报",
      "--definition-id",
      "daily-report",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatchObject({
      status: "executed",
      reason: null,
      targetDefinitionId: "daily-report",
      summary: "已启用定时任务：daily-report",
    });
  });
});
