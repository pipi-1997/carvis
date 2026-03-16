import { describe, expect, test } from "bun:test";

import { runCarvisCli } from "../../packages/carvis-cli/src/index.ts";

describe("carvis cli lifecycle contract", () => {
  test("start/status/doctor/stop 输出稳定 JSON 结构", async () => {
    const stdout: string[] = [];
    const exitCode = await runCarvisCli(["start"], {
      processManager: {
        start: async () => ({
          gateway: null,
          status: "ready",
          summary: "runtime ready",
        }),
      },
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual({
      command: "start",
      status: "ready",
      summary: "runtime ready",
    });
  });

  test("命名失败语义会保留在 status 与 doctor 中", async () => {
    const stdout: string[] = [];
    const exitCode = await runCarvisCli(["status"], {
      statusService: {
        getStatus: async () => ({
          adapter: "feishu",
          configSource: "existing",
          executor: {
            alive: true,
            lastErrorCode: "CODEX_UNAVAILABLE",
            status: "failed",
          },
          gateway: {
            alive: true,
            lastErrorCode: "FEISHU_WS_DISCONNECTED",
            status: "degraded",
          },
          overallStatus: "failed",
        }),
      },
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual(
      expect.objectContaining({
        command: "status",
        overallStatus: "failed",
        gateway: expect.objectContaining({
          lastErrorCode: "FEISHU_WS_DISCONNECTED",
        }),
        executor: expect.objectContaining({
          lastErrorCode: "CODEX_UNAVAILABLE",
        }),
      }),
    );
  });

  test("doctor 失败时返回 failed 和稳定检查列表", async () => {
    const stdout: string[] = [];
    const exitCode = await runCarvisCli(["doctor"], {
      doctorService: {
        run: async () => ({
          checks: [
            {
              checkId: "gateway_healthz",
              detail: "CONFIG_DRIFT",
              message: "gateway not ready",
              status: "failed",
            },
          ],
          failedChecks: [
            {
              checkId: "gateway_healthz",
              detail: "CONFIG_DRIFT",
              message: "gateway not ready",
              status: "failed",
            },
          ],
          status: "failed",
          summary: "1 checks failed",
        }),
      },
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(4);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual(
      expect.objectContaining({
        command: "doctor",
        status: "failed",
        failedChecks: [
          expect.objectContaining({
            checkId: "gateway_healthz",
          }),
        ],
      }),
    );
  });

  test("stop 遇到部分进程已退出时返回 partial 但完成清理", async () => {
    const stdout: string[] = [];
    const exitCode = await runCarvisCli(["stop"], {
      processManager: {
        stop: async () => ({
          missing: ["gateway"],
          removedState: ["gateway", "executor"],
          status: "partial",
          summary: "runtime stopped with partial cleanup",
        }),
      },
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual({
      command: "stop",
      missing: ["gateway"],
      removedState: ["gateway", "executor"],
      status: "partial",
      summary: "runtime stopped with partial cleanup",
    });
  });
});
