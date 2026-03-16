import { describe, expect, test } from "bun:test";

import { runCarvisCli } from "../../packages/carvis-cli/src/index.ts";
import { createCarvisCliHarness } from "../support/carvis-cli-harness.ts";

describe("carvis onboard feishu guidance", () => {
  test("onboard 默认展示字段级按需提示，错误凭据会在启动前失败，正确凭据会通过探测", async () => {
    const badHarness = await createCarvisCliHarness();
    const badNotes: Array<{ message: string; title?: string }> = [];
    const badExitCode = await runCarvisCli(["onboard"], {
      cwd: badHarness.workspacePath,
      env: {
        ...process.env,
        HOME: badHarness.homeDir,
      },
      onboardingPrompter: createPrompter(badHarness.workspacePath, badNotes),
      probeFeishuCredentials: async () => ({
        code: "INVALID_CREDENTIALS",
        message: "invalid app credential",
        ok: false,
      }),
      processManager: {
        start: async () => ({
          status: "ready",
          summary: "runtime ready",
        }),
      },
    });

    const goodHarness = await createCarvisCliHarness();
    const goodNotes: Array<{ message: string; title?: string }> = [];
    const goodExitCode = await runCarvisCli(["onboard"], {
      cwd: goodHarness.workspacePath,
      env: {
        ...process.env,
        HOME: goodHarness.homeDir,
      },
      onboardingPrompter: createPrompter(goodHarness.workspacePath, goodNotes),
      probeFeishuCredentials: async () => ({
        message: "feishu credentials ready",
        ok: true,
      }),
      processManager: {
        start: async () => ({
          status: "ready",
          summary: "runtime ready",
        }),
      },
    });

    expect(badExitCode).toBe(3);
    expect(await Bun.file(badHarness.fileSet.configPath).exists()).toBe(false);
    expect(goodExitCode).toBe(0);
    expect(await Bun.file(goodHarness.fileSet.configPath).exists()).toBe(true);
    expect(hasFieldHintNotes(badNotes)).toBe(true);
    expect(hasFieldHintNotes(goodNotes)).toBe(true);
    expect(hasFullGuideNotes(badNotes)).toBe(false);
    expect(hasFullGuideNotes(goodNotes)).toBe(false);

    await badHarness.cleanup();
    await goodHarness.cleanup();
  });
});

function createPrompter(
  workspacePath: string,
  notes: Array<{ message: string; title?: string }>,
) {
  return {
    async confirm(input: { id: string }) {
      if (input.id === "requireMention") {
        return false;
      }
      throw new Error(`unexpected confirm prompt: ${input.id}`);
    },
    async input(input: { id: string }) {
      switch (input.id) {
        case "appId":
          return "cli-app-id";
        case "appSecret":
          return "cli-app-secret";
        case "allowFrom":
          return "*";
        case "postgresUrl":
          return "postgres://carvis";
        case "redisUrl":
          return "redis://carvis";
        case "workspacePath":
          return workspacePath;
        default:
          throw new Error(`unexpected input prompt: ${input.id}`);
      }
    },
    async select(input: { id: string }) {
      if (input.id === "adapter") {
        return "feishu";
      }
      throw new Error(`unexpected select prompt: ${input.id}`);
    },
    note(message: string, title?: string) {
      notes.push({ message, title });
    },
  };
}

function hasFieldHintNotes(notes: Array<{ message: string; title?: string }>) {
  return notes.some((note) => note.title?.includes("Feishu App ID"))
    && notes.some((note) => note.title?.includes("Feishu App Secret"))
    && notes.some((note) => note.title?.includes("Allowlist"))
    && notes.some((note) => note.title?.includes("Require Mention"));
}

function hasFullGuideNotes(notes: Array<{ message: string; title?: string }>) {
  return notes.some((note) => note.title?.includes("飞书接入准备"))
    && notes.some((note) => note.message.includes("企业自建应用"))
    && notes.some((note) => note.message.includes("事件"));
}
