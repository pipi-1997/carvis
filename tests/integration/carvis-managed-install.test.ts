import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { runCarvisCli } from "../../packages/carvis-cli/src/index.ts";
import { createCarvisDaemonHarness } from "../support/carvis-daemon-harness.ts";

describe("carvis managed install", () => {
  test("install 后可以拉起 daemon 并返回稳定状态", async () => {
    const harness = await createCarvisDaemonHarness();
    const installStdout: string[] = [];
    const daemonStdout: string[] = [];
    const statusStdout: string[] = [];

    const installExitCode = await runCarvisCli(["install"], {
      env: harness.env,
      stdout(text) {
        installStdout.push(text);
      },
    });

    const startExitCode = await runCarvisCli(["daemon", "start"], {
      env: harness.env,
      stdout(text) {
        daemonStdout.push(text);
      },
    });

    const statusExitCode = await runCarvisCli(["daemon", "status"], {
      env: harness.env,
      stdout(text) {
        statusStdout.push(text);
      },
    });
    const infraStdout: string[] = [];
    const infraExitCode = await runCarvisCli(["infra", "status"], {
      env: harness.env,
      stdout(text) {
        infraStdout.push(text);
      },
    });
    const infraStopStdout: string[] = [];
    const infraStopExitCode = await runCarvisCli(["infra", "stop"], {
      env: harness.env,
      stdout(text) {
        infraStopStdout.push(text);
      },
    });
    const infraStartStdout: string[] = [];
    const infraStartExitCode = await runCarvisCli(["infra", "start"], {
      env: harness.env,
      stdout(text) {
        infraStartStdout.push(text);
      },
    });
    const infraRestartStdout: string[] = [];
    const infraRestartExitCode = await runCarvisCli(["infra", "restart"], {
      env: harness.env,
      stdout(text) {
        infraRestartStdout.push(text);
      },
    });
    const infraRebuildStdout: string[] = [];
    const infraRebuildExitCode = await runCarvisCli(["infra", "rebuild"], {
      env: harness.env,
      stdout(text) {
        infraRebuildStdout.push(text);
      },
    });

    const stopExitCode = await runCarvisCli(["daemon", "stop"], {
      env: harness.env,
    });

    expect(installExitCode).toBe(0);
    expect(startExitCode).toBe(0);
    expect(statusExitCode).toBe(0);
    expect(infraExitCode).toBe(0);
    expect(infraStopExitCode).toBe(0);
    expect(infraStartExitCode).toBe(0);
    expect(infraRestartExitCode).toBe(0);
    expect(infraRebuildExitCode).toBe(0);
    expect(stopExitCode).toBe(0);
    expect(JSON.parse(installStdout.at(-1) ?? "null")).toEqual(
      expect.objectContaining({
        command: "install",
        status: "installed",
      }),
    );
    expect(JSON.parse(daemonStdout.at(-1) ?? "null")).toEqual(
      expect.objectContaining({
        command: "daemon",
        operation: "start",
      }),
    );
    expect(JSON.parse(statusStdout.at(-1) ?? "null")).toEqual(
      expect.objectContaining({
        command: "daemon",
        operation: "status",
      }),
    );
    expect(JSON.parse(infraStdout.at(-1) ?? "null")).toEqual(
      expect.objectContaining({
        command: "infra",
        operation: "status",
        status: "ready",
      }),
    );
    expect(JSON.parse(infraStopStdout.at(-1) ?? "null")).toEqual(
      expect.objectContaining({
        command: "infra",
        operation: "stop",
        status: "stopped",
      }),
    );
    expect(JSON.parse(infraStartStdout.at(-1) ?? "null")).toEqual(
      expect.objectContaining({
        command: "infra",
        operation: "start",
        status: "ready",
      }),
    );
    expect(JSON.parse(infraRestartStdout.at(-1) ?? "null")).toEqual(
      expect.objectContaining({
        command: "infra",
        operation: "restart",
        status: "ready",
      }),
    );
    expect(JSON.parse(infraRebuildStdout.at(-1) ?? "null")).toEqual(
      expect.objectContaining({
        command: "infra",
        operation: "rebuild",
        status: "ready",
      }),
    );
    const runtimeEnvText = await readFile(harness.layout.runtimeEnvPath, "utf8");
    expect(runtimeEnvText).toContain("POSTGRES_URL=postgres://carvis:carvis@127.0.0.1:5432/carvis");
    expect(runtimeEnvText).toContain("REDIS_URL=redis://127.0.0.1:6379/0");

    await harness.cleanup();
  }, 30_000);
});
