import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

import { bootstrapCarvisDaemon } from "../../apps/daemon/src/bootstrap.ts";
import { createDaemonSupervisor } from "../../apps/daemon/src/supervisor.ts";
import { runCarvisCli } from "../../packages/carvis-cli/src/index.ts";
import { createDaemonClient } from "../../packages/carvis-cli/src/daemon-client.ts";
import { createCarvisDaemonHarness } from "../support/carvis-daemon-harness.ts";

describe("carvis daemon supervision contract", () => {
  test("daemon 通过 socket 暴露 infra 生命周期并注入托管依赖地址", async () => {
    const harness = await createCarvisDaemonHarness();
    const installStdout: string[] = [];

    const installExitCode = await runCarvisCli(["install"], {
      env: harness.env,
      stdout(text) {
        installStdout.push(text);
      },
    });
    expect(installExitCode).toBe(0);
    expect(JSON.parse(installStdout.at(-1) ?? "null")).toEqual(
      expect.objectContaining({
        command: "install",
        status: "installed",
      }),
    );

    await bootstrapCarvisDaemon({
      env: harness.env,
    });

    const client = createDaemonClient({
      env: harness.env,
    });

    const daemonStatus = await client.request({
      action: "daemon_status",
    });
    expect(daemonStatus).toEqual(
      expect.objectContaining({
        daemon: expect.objectContaining({
          serviceState: "ready",
        }),
        status: "ready",
      }),
    );

    const infraStatus = await client.request({
      action: "infra_status",
    });
    expect(infraStatus).toEqual(
      expect.objectContaining({
        infra: expect.objectContaining({
          postgres: expect.objectContaining({
            status: "ready",
          }),
          redis: expect.objectContaining({
            status: "ready",
          }),
        }),
        status: "ready",
      }),
    );

    const runtimeEnvText = await readFile(harness.layout.runtimeEnvPath, "utf8");
    expect(runtimeEnvText).toContain("POSTGRES_URL=postgres://carvis:carvis@127.0.0.1:5432/carvis");
    expect(runtimeEnvText).toContain("REDIS_URL=redis://127.0.0.1:6379/0");

    const stopStatus = await client.request({
      action: "infra_stop",
    });
    expect(stopStatus).toEqual(
      expect.objectContaining({
        infra: expect.objectContaining({
          postgres: expect.objectContaining({
            status: "stopped",
          }),
          redis: expect.objectContaining({
            status: "stopped",
          }),
        }),
      }),
    );

    const startStatus = await client.request({
      action: "infra_start",
    });
    expect(startStatus).toEqual(
      expect.objectContaining({
        infra: expect.objectContaining({
          postgres: expect.objectContaining({
            status: "ready",
          }),
          redis: expect.objectContaining({
            status: "ready",
          }),
        }),
      }),
    );

    const restartStatus = await client.request({
      action: "infra_restart",
    });
    expect(restartStatus).toEqual(
      expect.objectContaining({
        infra: expect.objectContaining({
          postgres: expect.objectContaining({
            status: "ready",
          }),
          redis: expect.objectContaining({
            status: "ready",
          }),
        }),
      }),
    );

    const rebuildStatus = await client.request({
      action: "infra_rebuild",
    });
    expect(rebuildStatus).toEqual(
      expect.objectContaining({
        infra: expect.objectContaining({
          postgres: expect.objectContaining({
            status: "ready",
          }),
          redis: expect.objectContaining({
            status: "ready",
          }),
        }),
      }),
    );

    await client.request({
      action: "daemon_stop",
    }).catch(() => null);
    await harness.cleanup();
  }, 30_000);

  test("infra 动作不会隐式启动 runtime", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-daemon-supervisor-"));
    const socketPath = join(homeDir, "daemon.sock");
    const startCalls: string[] = [];
    const processSupervisor = {
      async start() {
        startCalls.push("start");
        return {
          status: "ready",
          summary: "runtime ready",
        };
      },
      async stop() {
        startCalls.push("stop");
        return {
          status: "stopped",
          summary: "runtime stopped",
        };
      },
    };
    const infraManager = {
      async probe() {
        return {
          postgres: { status: "ready", summary: "postgres ready" },
          redis: { status: "ready", summary: "redis ready" },
        };
      },
      async start() {
        return {
          postgres: { status: "ready", summary: "postgres ready" },
          redis: { status: "ready", summary: "redis ready" },
        };
      },
      async restart() {
        return {
          postgres: { status: "ready", summary: "postgres ready" },
          redis: { status: "ready", summary: "redis ready" },
        };
      },
      async rebuild() {
        return {
          postgres: { status: "ready", summary: "postgres ready" },
          redis: { status: "ready", summary: "redis ready" },
        };
      },
      async stop() {
        return {
          postgres: { status: "stopped", summary: "postgres stopped" },
          redis: { status: "stopped", summary: "redis stopped" },
        };
      },
      async write() {},
      async read() {
        return {
          postgres: { status: "ready", summary: "postgres ready" },
          redis: { status: "ready", summary: "redis ready" },
        };
      },
    };

    await mkdir(homeDir, { recursive: true });
    await createDaemonSupervisor({
      env: {
        ...process.env,
        HOME: homeDir,
      },
      infraManager,
      processSupervisor,
      socketPath,
      statusService: {
        async getStatus() {
          return {
            daemon: {
              status: "ready",
              summary: "daemon ready",
            },
            infra: {
              components: {
                postgres: { status: "ready", summary: "postgres ready" },
                redis: { status: "ready", summary: "redis ready" },
              },
              status: "ready",
              summary: "infra ready",
            },
            overallStatus: "degraded",
            runtime: {
              summary: "runtime stopped",
            },
          };
        },
      },
    }).start();

    const client = createDaemonClient({
      env: {
        ...process.env,
        HOME: homeDir,
      },
      socketPath,
    });

    await client.request({ action: "infra_start" });
    await client.request({ action: "infra_restart" });
    await client.request({ action: "infra_rebuild" });
    expect(startCalls).toEqual([]);

    await client.request({
      action: "daemon_stop",
    }).catch(() => null);
    await rm(homeDir, { force: true, recursive: true });
  });
});
