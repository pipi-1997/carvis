import { describe, expect, test } from "bun:test";

import { runCarvisCli } from "../../packages/carvis-cli/src/index.ts";

describe("carvis cli output mode", () => {
  test("TTY 默认输出人类可读结果", async () => {
    const stdout: string[] = [];

    const exitCode = await runCarvisCli(["start"], {
      processManager: {
        start: async () => ({
          status: "ready",
          summary: "runtime ready",
        }),
      },
      stdout(text) {
        stdout.push(text);
      },
      stdoutIsTTY: true,
    });

    expect(exitCode).toBe(0);
    expect(stdout).toEqual(["runtime ready"]);
  });

  test("--json 会强制输出结构化结果", async () => {
    const stdout: string[] = [];

    const exitCode = await runCarvisCli(["start", "--json"], {
      processManager: {
        start: async () => ({
          status: "ready",
          summary: "runtime ready",
        }),
      },
      stdout(text) {
        stdout.push(text);
      },
      stdoutIsTTY: true,
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual({
      command: "start",
      status: "ready",
      summary: "runtime ready",
    });
  });
});
