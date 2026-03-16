import { describe, expect, test } from "bun:test";

import { summarizeDoctorChecks } from "../../packages/carvis-cli/src/doctor.ts";

describe("carvis cli doctor", () => {
  test("全部通过时汇总为 passed", () => {
    const result = summarizeDoctorChecks([
      { checkId: "runtime_config_valid", message: "ok", status: "passed" },
      { checkId: "feishu_credentials", message: "ok", status: "passed" },
      { checkId: "postgres_ping", message: "ok", status: "passed" },
    ]);

    expect(result.status).toBe("passed");
    expect(result.failedChecks).toEqual([]);
  });

  test("存在失败检查时汇总为 failed 并保留失败项", () => {
    const result = summarizeDoctorChecks([
      { checkId: "runtime_config_valid", message: "ok", status: "passed" },
      {
        checkId: "gateway_healthz",
        detail: "FEISHU_WS_DISCONNECTED",
        message: "gateway not ready",
        status: "failed",
      },
      {
        checkId: "codex_cli",
        message: "codex unavailable",
        status: "failed",
      },
    ]);

    expect(result.status).toBe("failed");
    expect(result.failedChecks.map((check) => check.checkId)).toEqual([
      "gateway_healthz",
      "codex_cli",
    ]);
  });
});
