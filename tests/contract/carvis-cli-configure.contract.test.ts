import { describe, expect, test } from "bun:test";

import { runCarvisCli } from "../../packages/carvis-cli/src/index.ts";

describe("carvis cli configure contract", () => {
  test("configure feishu 输出 updated 结果", async () => {
    const stdout: string[] = [];
    const exitCode = await runCarvisCli(["configure", "feishu"], {
      configureService: {
        run: async () => ({
          section: "feishu",
          status: "updated",
          summary: "feishu updated",
        }),
      },
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual({
      command: "configure",
      section: "feishu",
      status: "updated",
      summary: "feishu updated",
    });
  });

  test("configure workspace 失败时返回 failed", async () => {
    const stdout: string[] = [];
    const exitCode = await runCarvisCli(["configure", "workspace"], {
      configureService: {
        run: async () => ({
          reason: "invalid_workspace",
          section: "workspace",
          status: "failed",
          summary: "workspace path invalid",
        }),
      },
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(4);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual({
      command: "configure",
      reason: "invalid_workspace",
      section: "workspace",
      status: "failed",
      summary: "workspace path invalid",
    });
  });
});
