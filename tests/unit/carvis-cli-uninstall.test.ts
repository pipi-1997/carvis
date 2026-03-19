import { describe, expect, test } from "bun:test";

import { createUninstallService } from "../../packages/carvis-cli/src/uninstall.ts";

describe("carvis uninstall service", () => {
  test("compose down 失败时不会伪造 completed", async () => {
    const service = createUninstallService({
      daemonClient: {
        async readCachedStatus() {
          return null;
        },
        async request() {
          return {
            status: "stopped",
            summary: "daemon stopped",
          };
        },
        socketPath: "/tmp/daemon.sock",
      },
      env: {
        ...process.env,
        HOME: "/tmp/carvis-uninstall",
      },
      execImpl: async () => {
        throw new Error("compose down failed");
      },
      platformServiceManager: {
        async getStatus() {
          return {
            definitionPath: null,
            enabled: false,
            kind: null,
            loaded: false,
            supported: false,
            unitNameOrLabel: null,
          };
        },
        async installDefinition() {
          throw new Error("not used");
        },
        async removeDefinition() {
          return {
            removed: false,
            supported: false,
          };
        },
      },
    });

    const result = await service.run();
    expect(result.status).toBe("failed");
    expect(result.summary).toContain("compose down failed");
  });

  test("daemon 不可达时仍允许继续执行幂等卸载", async () => {
    const service = createUninstallService({
      daemonClient: {
        async readCachedStatus() {
          return null;
        },
        async request() {
          throw new Error("socket not found");
        },
        socketPath: "/tmp/daemon.sock",
      },
      env: {
        ...process.env,
        HOME: "/tmp/carvis-uninstall",
      },
      execImpl: async () => ({
        stderr: "",
        stdout: "",
      }),
      platformServiceManager: {
        async getStatus() {
          return {
            definitionPath: null,
            enabled: false,
            kind: null,
            loaded: false,
            supported: false,
            unitNameOrLabel: null,
          };
        },
        async installDefinition() {
          throw new Error("not used");
        },
        async removeDefinition() {
          return {
            removed: false,
            supported: false,
          };
        },
      },
    });

    const result = await service.run();
    expect(result.status).toBe("completed");
  });
});
