import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveManagedInstallLayout } from "../../packages/carvis-cli/src/install-layout.ts";
import { createInstallService } from "../../packages/carvis-cli/src/install.ts";
import { DockerCliMissingError } from "../../packages/carvis-cli/src/docker-engine.ts";

describe("carvis install layout", () => {
  test("默认布局会把版本、运行目录和状态目录收敛到 ~/.carvis 下", () => {
    const layout = resolveManagedInstallLayout({
      homeDir: "/tmp/carvis-home",
    });

    expect(layout.installRoot).toBe("/tmp/carvis-home/.carvis");
    expect(layout.versionsDir).toBe("/tmp/carvis-home/.carvis/versions");
    expect(layout.runDir).toBe("/tmp/carvis-home/.carvis/run");
    expect(layout.installManifestPath).toBe("/tmp/carvis-home/.carvis/install-manifest.json");
    expect(layout.daemonSocketPath).toBe(join("/tmp/carvis-home/.carvis/run", "daemon.sock"));
    expect(layout.postgresDataDir).toBe("/tmp/carvis-home/.carvis/data/postgres");
    expect(layout.redisDataDir).toBe("/tmp/carvis-home/.carvis/data/redis");
    expect(layout.infraDir).toBe("/tmp/carvis-home/.carvis/infra");
    expect(layout.composeFilePath).toBe("/tmp/carvis-home/.carvis/infra/docker-compose.yml");
    expect(layout.composeEnvPath).toBe("/tmp/carvis-home/.carvis/infra/.env");
    expect(layout.composeProjectName).toBe("carvis-managed");
  });

  test("install writes compose assets under infra", async () => {
    const home = await mkdtemp(join(tmpdir(), "carvis-install-"));
    const installService = createInstallService({
      env: { HOME: home },
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
          throw new Error("should not be called");
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
          return;
        },
      },
    });

    await installService.run();
    expect(await Bun.file(join(home, ".carvis", "infra", "docker-compose.yml")).text())
      .toContain("version:");
    expect(await Bun.file(join(home, ".carvis", "infra", ".env")).text())
      .toContain("COMPOSE_PROJECT_NAME=");
  });

  test("preflight failure aborts before service definition", async () => {
    const home = await mkdtemp(join(tmpdir(), "carvis-install-"));
    const events: string[] = [];
    const installService = createInstallService({
      env: { HOME: home },
      platformServiceManager: {
        async getStatus() {
          events.push("getStatus");
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
          events.push("installDefinition");
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
    });

    const result = await installService.run();
    expect(result.install.status).toBe("failed");
    expect(events).toEqual([]);
  });

  test("install 会把 daemon args 透传给 service definition", async () => {
    const home = await mkdtemp(join(tmpdir(), "carvis-install-"));
    const serviceDefinitionInputs: Array<{
      args?: string[];
      daemonProgram: string;
      env?: Record<string, string | undefined>;
      label?: string;
      logPath: string;
    }> = [];
    const installService = createInstallService({
      env: { HOME: home },
      platformServiceManager: {
        async getStatus() {
          return {
            supported: true,
            definitionPath: join(home, "Library", "LaunchAgents", "com.carvis.daemon.plist"),
            enabled: false,
            kind: "launchd_user",
            loaded: false,
            unitNameOrLabel: "com.carvis.daemon",
          };
        },
        async installDefinition(input) {
          serviceDefinitionInputs.push(input);
          return {
            definitionPath: join(home, "Library", "LaunchAgents", "com.carvis.daemon.plist"),
            enabled: true,
            kind: "launchd_user",
            loaded: false,
            unitNameOrLabel: "com.carvis.daemon",
          };
        },
        async removeDefinition() {
          return {
            removed: false,
            supported: true,
          };
        },
      },
      dockerEngine: {
        async preflight() {
          return;
        },
      },
    });

    await installService.run({
      repair: true,
    });

    expect(serviceDefinitionInputs).toHaveLength(1);
    expect(serviceDefinitionInputs[0]?.args).toEqual([
      "--bun",
      "/Users/pipi/workspace/carvis/apps/daemon/src/index.ts",
    ]);
  });
});
