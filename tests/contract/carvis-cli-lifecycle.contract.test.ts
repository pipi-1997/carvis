import { describe, expect, test } from "bun:test";

import { runCarvisCli } from "../../packages/carvis-cli/src/index.ts";
import { createInstallService } from "../../packages/carvis-cli/src/install.ts";
import {
  DockerCliMissingError,
  DockerComposeMissingError,
  DockerDaemonUnavailableError,
} from "../../packages/carvis-cli/src/docker-engine.ts";
import { createCarvisCliHarness } from "../support/carvis-cli-harness.ts";

describe("carvis cli lifecycle contract", () => {
  test("install 输出稳定 JSON 结构", async () => {
    const stdout: string[] = [];
    const exitCode = await runCarvisCli(["install"], {
      installService: {
        run: async () => ({
          install: {
            status: "installed",
            summary: "install ready",
            composeFilePath: "/tmp/carvis-home/.carvis/infra/docker-compose.yml",
            composeEnvPath: "/tmp/carvis-home/.carvis/infra/.env",
            composeProjectName: "carvis-managed",
          },
          nextStep: "carvis onboard",
          status: "installed",
          summary: "install ready",
        }),
      },
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual({
      command: "install",
      install: {
        status: "installed",
        summary: "install ready",
        composeFilePath: expect.any(String),
        composeEnvPath: expect.any(String),
        composeProjectName: expect.any(String),
      },
      nextStep: "carvis onboard",
      status: "installed",
      summary: "install ready",
    });
  });

  test("start/status/doctor/stop 输出稳定 JSON 结构", async () => {
    const stdout: string[] = [];
    const exitCode = await runCarvisCli(["start"], {
      daemonCommandService: {
        run: async () => ({
          command: "daemon",
          operation: "start",
          status: "ready",
          summary: "daemon ready",
        }),
      },
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
      mappedTo: "carvis daemon start",
      status: "ready",
      summary: "daemon ready",
    });
  });

  test("daemon 和 infra 子命令返回稳定 JSON 结构", async () => {
    const stdout: string[] = [];
    const infraStdout: string[] = [];

    const daemonExitCode = await runCarvisCli(["daemon", "status"], {
      daemonCommandService: {
        run: async () => ({
          command: "daemon",
          daemon: {
            serviceState: "ready",
            socketReachable: true,
          },
          operation: "status",
          status: "ready",
          summary: "daemon ready",
        }),
      },
      stdout(text) {
        stdout.push(text);
      },
    });

    const infraExitCode = await runCarvisCli(["infra", "status"], {
      infraCommandService: {
        run: async () => ({
          command: "infra",
          infra: {
            postgres: {
              status: "ready",
            },
            redis: {
              status: "ready",
            },
          },
          operation: "status",
          status: "ready",
          summary: "infra ready",
        }),
      },
      stdout(text) {
        infraStdout.push(text);
      },
    });

    expect(daemonExitCode).toBe(0);
    expect(infraExitCode).toBe(0);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual({
      command: "daemon",
      daemon: {
        serviceState: "ready",
        socketReachable: true,
      },
      operation: "status",
      status: "ready",
      summary: "daemon ready",
    });
    expect(JSON.parse(infraStdout.at(-1) ?? "null")).toEqual({
      command: "infra",
      infra: {
        postgres: {
          status: "ready",
        },
        redis: {
          status: "ready",
        },
      },
      operation: "status",
      status: "ready",
      summary: "infra ready",
    });
  });

  test("命名失败语义会保留在 status 与 doctor 中", async () => {
    const stdout: string[] = [];
    const exitCode = await runCarvisCli(["status"], {
      statusService: {
        getStatus: async () => ({
          daemon: {
            status: "ready",
          },
          externalDependencies: {
            components: {
              codex_cli: {
                lastErrorCode: "CODEX_UNAVAILABLE",
                status: "failed",
              },
              feishu_credentials: {
                lastErrorCode: "FEISHU_WS_DISCONNECTED",
                status: "degraded",
              },
            },
            status: "failed",
          },
          install: {
            status: "installed",
          },
          infra: {
            status: "ready",
          },
          overallStatus: "failed",
          runtime: {
            components: {
              executor: {
                lastErrorCode: "CODEX_UNAVAILABLE",
                status: "failed",
              },
              gateway: {
                lastErrorCode: "FEISHU_WS_DISCONNECTED",
                status: "degraded",
              },
            },
            status: "failed",
          },
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
        runtime: expect.objectContaining({
          components: expect.objectContaining({
            executor: expect.objectContaining({
              lastErrorCode: "CODEX_UNAVAILABLE",
            }),
            gateway: expect.objectContaining({
              lastErrorCode: "FEISHU_WS_DISCONNECTED",
            }),
          }),
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
              layer: "runtime",
              message: "gateway not ready",
              recommendedAction: "carvis daemon restart",
              status: "failed",
            },
          ],
          failedChecks: [
            {
              checkId: "gateway_healthz",
              detail: "CONFIG_DRIFT",
              layer: "runtime",
              message: "gateway not ready",
              recommendedAction: "carvis daemon restart",
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
      daemonCommandService: {
        run: async () => ({
          command: "daemon",
          operation: "stop",
          status: "stopped",
          summary: "daemon stopped",
        }),
      },
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
      mappedTo: "carvis daemon stop",
      status: "stopped",
      summary: "daemon stopped",
    });
  });

  test("uninstall 输出稳定 JSON 结构", async () => {
    const stdout: string[] = [];
    const exitCode = await runCarvisCli(["uninstall", "--purge"], {
      uninstallService: {
        run: async () => ({
          command: "uninstall",
          purge: true,
          removed: ["bundle", "service_definition", "data", "state"],
          status: "completed",
          summary: "carvis uninstalled",
        }),
      },
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual({
      command: "uninstall",
      purge: true,
      removed: ["bundle", "service_definition", "data", "state"],
      status: "completed",
      summary: "carvis uninstalled",
    });
  });

  test("install preflight failure for missing docker CLI reports failed install", async () => {
    const harness = await createCarvisCliHarness();
    const stdout: string[] = [];
    const exitCode = await runCarvisCli(["install"], {
      env: {
        ...process.env,
        HOME: harness.homeDir,
      },
      installService: createInstallService({
        env: { HOME: harness.homeDir },
        platformServiceManager: {
          async getStatus() {
            return {
              supported: false,
              definitionPath: null,
              enabled: false,
              kind: null,
              loaded: false,
              unitNameOrLabel: null,
            };
          },
          async installDefinition() {
            throw new Error("unexpected");
          },
          async removeDefinition() {
            return {
              removed: false,
              supported: false,
            };
          },
        },
        dockerEngine: {
          async preflight() {
            throw new DockerCliMissingError();
          },
        },
      }),
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(4);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual({
      command: "install",
      install: expect.objectContaining({
        status: "failed",
        composeFilePath: expect.any(String),
        composeEnvPath: expect.any(String),
        composeProjectName: expect.any(String),
        summary: expect.stringContaining("docker CLI is not installed"),
      }),
      nextStep: "carvis install",
      status: "failed",
      summary: expect.stringContaining("docker CLI is not installed"),
    });
    await harness.cleanup();
  });

  test("install preflight failure for missing docker compose reports failed install", async () => {
    const harness = await createCarvisCliHarness();
    const stdout: string[] = [];
    const exitCode = await runCarvisCli(["install"], {
      env: {
        ...process.env,
        HOME: harness.homeDir,
      },
      installService: createInstallService({
        env: { HOME: harness.homeDir },
        platformServiceManager: {
          async getStatus() {
            return {
              supported: false,
              definitionPath: null,
              enabled: false,
              kind: null,
              loaded: false,
              unitNameOrLabel: null,
            };
          },
          async installDefinition() {
            throw new Error("unexpected");
          },
          async removeDefinition() {
            return {
              removed: false,
              supported: false,
            };
          },
        },
        dockerEngine: {
          async preflight() {
            throw new DockerComposeMissingError();
          },
        },
      }),
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(4);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual({
      command: "install",
      install: expect.objectContaining({
        status: "failed",
        summary: expect.stringContaining("docker compose is not installed"),
      }),
      nextStep: "carvis install",
      status: "failed",
      summary: expect.stringContaining("docker compose is not installed"),
    });
    await harness.cleanup();
  });

  test("install preflight failure for docker daemon unresponsive reports failed install", async () => {
    const harness = await createCarvisCliHarness();
    const stdout: string[] = [];
    const exitCode = await runCarvisCli(["install"], {
      env: {
        ...process.env,
        HOME: harness.homeDir,
      },
      installService: createInstallService({
        env: { HOME: harness.homeDir },
        platformServiceManager: {
          async getStatus() {
            return {
              supported: false,
              definitionPath: null,
              enabled: false,
              kind: null,
              loaded: false,
              unitNameOrLabel: null,
            };
          },
          async installDefinition() {
            throw new Error("unexpected");
          },
          async removeDefinition() {
            return {
              removed: false,
              supported: false,
            };
          },
        },
        dockerEngine: {
          async preflight() {
            throw new DockerDaemonUnavailableError();
          },
        },
      }),
      stdout(text) {
        stdout.push(text);
      },
    });

    expect(exitCode).toBe(4);
    expect(JSON.parse(stdout.at(-1) ?? "null")).toEqual({
      command: "install",
      install: expect.objectContaining({
        status: "failed",
        summary: expect.stringContaining("docker daemon is not responding"),
      }),
      nextStep: "carvis install",
      status: "failed",
      summary: expect.stringContaining("docker daemon is not responding"),
    });
    await harness.cleanup();
  });
});
