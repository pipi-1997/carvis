import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createDoctorService, summarizeDoctorChecks } from "../../packages/carvis-cli/src/doctor.ts";
import { DockerDaemonUnavailableError } from "../../packages/carvis-cli/src/docker-engine.ts";
import { createRuntimeHarness } from "../support/runtime-harness.ts";

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

  test("仅通过 runtime.env 提供秘密时不会在 runtime_config_valid 阶段失败", async () => {
    const harness = await createRuntimeHarness({
      env: {
        FEISHU_APP_ID: "",
        FEISHU_APP_SECRET: "",
        POSTGRES_URL: "",
        REDIS_URL: "",
      },
    });

    await writeFile(
      join(harness.paths.configDir, "runtime.env"),
      [
        "FEISHU_APP_ID=file_app_id",
        "FEISHU_APP_SECRET=file_app_secret",
        "POSTGRES_URL=postgres://from-file",
        "REDIS_URL=redis://from-file",
      ].join("\n"),
    );

    const result = await createDoctorService({
      env: harness.env,
      createPostgresClientImpl: async () => ({
        close: async () => {},
        ping: async () => true,
      }) as never,
      createRedisClientImpl: async () => ({
        close: async () => {},
        ping: async () => true,
      }) as never,
      fetchImpl: async () => new Response(JSON.stringify({
        state: {
          ready: true,
        },
      }), {
        headers: {
          "content-type": "application/json",
        },
      }),
      healthcheckCodex: async () => ({
        message: "codex ready",
        ok: true,
      }),
      probeFeishuCredentialsImpl: async () => ({
        message: "feishu ready",
        ok: true,
      }),
    }).run();

    expect(result.checks[0]?.checkId).toBe("runtime_config_valid");
    expect(result.checks[0]?.status).toBe("passed");

    await harness.cleanup();
  });

  test("docker preflight 失败时会返回 infra 层失败并跳过数据库连通性探测", async () => {
    const harness = await createRuntimeHarness();

    const result = await createDoctorService({
      dockerEngine: {
        async preflight() {
          throw new DockerDaemonUnavailableError();
        },
      },
      env: harness.env,
      healthcheckCodex: async () => ({
        message: "codex ready",
        ok: true,
      }),
      probeFeishuCredentialsImpl: async () => ({
        message: "feishu ready",
        ok: true,
      }),
    }).run();

    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkId: "docker_engine",
          layer: "infra",
          status: "failed",
        }),
        expect.objectContaining({
          checkId: "postgres_ping",
          status: "skipped",
        }),
        expect.objectContaining({
          checkId: "redis_ping",
          status: "skipped",
        }),
      ]),
    );
    expect(result.infraLayer.status).toBe("stopped");

    await harness.cleanup();
  });
});
