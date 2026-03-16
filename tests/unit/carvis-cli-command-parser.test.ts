import { describe, expect, test } from "bun:test";

import { parseCarvisCommand } from "../../packages/carvis-cli/src/command-parser.ts";

describe("carvis cli command parser", () => {
  test("解析 onboard/start/stop/status/doctor 子命令", () => {
    expect(parseCarvisCommand(["onboard"])).toEqual({
      ok: true,
      command: {
        action: "onboard",
      },
    });
    expect(parseCarvisCommand(["start"])).toEqual({
      ok: true,
      command: {
        action: "start",
      },
    });
    expect(parseCarvisCommand(["stop"])).toEqual({
      ok: true,
      command: {
        action: "stop",
      },
    });
    expect(parseCarvisCommand(["status"])).toEqual({
      ok: true,
      command: {
        action: "status",
      },
    });
    expect(parseCarvisCommand(["doctor"])).toEqual({
      ok: true,
      command: {
        action: "doctor",
      },
    });
  });

  test("解析 configure section", () => {
    expect(parseCarvisCommand(["configure", "feishu"])).toEqual({
      ok: true,
      command: {
        action: "configure",
        section: "feishu",
      },
    });
    expect(parseCarvisCommand(["configure", "workspace"])).toEqual({
      ok: true,
      command: {
        action: "configure",
        section: "workspace",
      },
    });
  });

  test("缺少 configure section 时返回稳定错误", () => {
    expect(parseCarvisCommand(["configure"])).toEqual({
      ok: false,
      result: {
        reason: "missing_section",
        status: "rejected",
        summary: "configure 需要 section：feishu 或 workspace。",
      },
    });
  });

  test("未知命令时返回稳定错误", () => {
    expect(parseCarvisCommand(["restart"])).toEqual({
      ok: false,
      result: {
        reason: "invalid_command",
        status: "rejected",
        summary: "用法错误：需要 onboard、start、stop、status、doctor 或 configure 子命令。",
      },
    });
  });

  test("命令后附带 runtime flags 时仍解析主命令", () => {
    expect(parseCarvisCommand(["onboard"])).toEqual({
      ok: true,
      command: {
        action: "onboard",
      },
    });
    expect(parseCarvisCommand(["configure", "feishu"])).toEqual({
      ok: true,
      command: {
        action: "configure",
        section: "feishu",
      },
    });
  });
});
