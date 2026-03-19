import { describe, expect, test } from "bun:test";

import { createPlatformServiceManager } from "../../packages/carvis-cli/src/platform-service-manager.ts";

describe("carvis platform service manager", () => {
  test("darwin 会生成 launchd user plist", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const manager = createPlatformServiceManager({
      homeDir: "/tmp/carvis-home",
      platform: "darwin",
      writeFileImpl: async (path, content) => {
        writes.push({
          path,
          content,
        });
      },
    });

    const result = await manager.installDefinition({
      daemonProgram: "/tmp/carvis-home/.carvis/current/apps/daemon/bin/carvis-daemon.cjs",
      env: {
        HOME: "/tmp/carvis-home",
      },
      label: "com.carvis.daemon",
      logPath: "/tmp/carvis-home/.carvis/logs/daemon.log",
    });

    expect(result.kind).toBe("launchd_user");
    expect(result.definitionPath).toContain("/Library/LaunchAgents/com.carvis.daemon.plist");
    expect(writes.at(-1)?.content).toContain("<key>Label</key>");
    expect(writes.at(-1)?.content).toContain("com.carvis.daemon");
  });

  test("linux 会生成 systemd user unit", async () => {
    const writes: Array<{ path: string; content: string }> = [];
    const manager = createPlatformServiceManager({
      homeDir: "/tmp/carvis-home",
      platform: "linux",
      writeFileImpl: async (path, content) => {
        writes.push({
          path,
          content,
        });
      },
    });

    const result = await manager.installDefinition({
      daemonProgram: "/tmp/carvis-home/.carvis/current/apps/daemon/bin/carvis-daemon.cjs",
      env: {
        HOME: "/tmp/carvis-home",
      },
      label: "carvis-daemon.service",
      logPath: "/tmp/carvis-home/.carvis/logs/daemon.log",
    });

    expect(result.kind).toBe("systemd_user");
    expect(result.definitionPath).toContain("/.config/systemd/user/carvis-daemon.service");
    expect(writes.at(-1)?.content).toContain("[Unit]");
    expect(writes.at(-1)?.content).toContain("ExecStart=");
  });
});
