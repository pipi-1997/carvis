import { describe, expect, test } from "bun:test";

import { parseCarvisCommand } from "../../packages/carvis-cli/src/command-parser.ts";

describe("carvis cli command parser", () => {
  test("解析 install/daemon/infra/uninstall 子命令", () => {
    expect(parseCarvisCommand(["install"])).toEqual({
      ok: true,
      command: {
        action: "install",
        repair: false,
      },
    });
    expect(parseCarvisCommand(["install", "--repair"])).toEqual({
      ok: true,
      command: {
        action: "install",
        repair: true,
      },
    });
    expect(parseCarvisCommand(["daemon", "status"])).toEqual({
      ok: true,
      command: {
        action: "daemon",
        operation: "status",
      },
    });
    expect(parseCarvisCommand(["infra", "rebuild"])).toEqual({
      ok: true,
      command: {
        action: "infra",
        operation: "rebuild",
      },
    });
    expect(parseCarvisCommand(["uninstall"])).toEqual({
      ok: true,
      command: {
        action: "uninstall",
        purge: false,
      },
    });
    expect(parseCarvisCommand(["uninstall", "--purge"])).toEqual({
      ok: true,
      command: {
        action: "uninstall",
        purge: true,
      },
    });
  });

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

  test("缺少 daemon 或 infra 子命令时返回稳定错误", () => {
    expect(parseCarvisCommand(["daemon"])).toEqual({
      ok: false,
      result: {
        reason: "missing_subcommand",
        status: "rejected",
        summary: "daemon 需要子命令：status、start、stop 或 restart。",
      },
    });
    expect(parseCarvisCommand(["infra"])).toEqual({
      ok: false,
      result: {
        reason: "missing_subcommand",
        status: "rejected",
        summary: "infra 需要子命令：status、start、stop、restart 或 rebuild。",
      },
    });
  });

  test("未知命令时返回稳定错误", () => {
    expect(parseCarvisCommand(["restart"])).toEqual({
      ok: false,
      result: {
        reason: "invalid_command",
        status: "rejected",
        summary: "用法错误：需要 install、onboard、daemon、infra、status、doctor、uninstall、start、stop 或 configure 子命令。",
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
