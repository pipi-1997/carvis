import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("runtime env wrapper script", () => {
  test("保留调用方显式传入的环境变量，不被 runtime.env 覆盖", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "carvis-runtime-env-"));
    const envFile = join(tempDir, "runtime.env");
    await writeFile(
      envFile,
      [
        "FEISHU_APP_ID=file-app-id",
        "POSTGRES_URL=postgres://file",
      ].join("\n"),
    );

    const result = Bun.spawnSync(
      ["./scripts/run-with-runtime-env.sh", "env"],
      {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
          HOME: process.env.HOME ?? "/tmp",
          CARVIS_RUNTIME_ENV_FILE: envFile,
          FEISHU_APP_ID: "explicit-app-id",
        },
      },
    );

    await rm(tempDir, { force: true, recursive: true });

    const stdout = new TextDecoder().decode(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("FEISHU_APP_ID=explicit-app-id");
    expect(stdout).toContain("POSTGRES_URL=postgres://file");
  });

  test("调用方未显式传入时从 runtime.env 加载变量", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "carvis-runtime-env-"));
    const envFile = join(tempDir, "runtime.env");
    await writeFile(
      envFile,
      [
        "FEISHU_APP_ID=file-app-id",
        "POSTGRES_URL=postgres://file",
      ].join("\n"),
    );

    const result = Bun.spawnSync(
      ["./scripts/run-with-runtime-env.sh", "env"],
      {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
          HOME: process.env.HOME ?? "/tmp",
          CARVIS_RUNTIME_ENV_FILE: envFile,
        },
      },
    );

    await rm(tempDir, { force: true, recursive: true });

    const stdout = new TextDecoder().decode(result.stdout);
    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("FEISHU_APP_ID=file-app-id");
    expect(stdout).toContain("POSTGRES_URL=postgres://file");
  });
});
