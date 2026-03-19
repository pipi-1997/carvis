import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createManagedInfraManager } from "../../apps/daemon/src/infra-manager.ts";
import { resolveCarvisRuntimeFileSet } from "../../packages/carvis-cli/src/config-writer.ts";

describe("carvis daemon infra manager", () => {
  test("stop 失败时会写入 failed 状态而不是伪造 stopped", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-daemon-infra-"));
    const fileSet = resolveCarvisRuntimeFileSet({
      homeDir,
    });
    await mkdir(fileSet.configDir, { recursive: true });

    const manager = createManagedInfraManager({
      env: {
        ...process.env,
        HOME: homeDir,
      },
      execImpl: async () => {
        throw new Error("docker stop failed");
      },
    });

    const state = await manager.stop();
    expect(state).toEqual({
      postgres: {
        status: "failed",
        summary: "docker stop failed",
      },
      redis: {
        status: "failed",
        summary: "docker stop failed",
      },
    });
  });

  test("probe 会把 unhealthy 容器标记为 degraded", async () => {
    const homeDir = await mkdtemp(join(tmpdir(), "carvis-daemon-infra-"));
    const manager = createManagedInfraManager({
      env: {
        ...process.env,
        HOME: homeDir,
      },
      execImpl: async (_file, args) => {
        if (args.includes("ps")) {
          return {
            stderr: "",
            stdout: JSON.stringify([
              {
                Health: "healthy",
                Service: "postgres",
                State: "running",
              },
              {
                Health: "unhealthy",
                Service: "redis",
                State: "running",
              },
            ]),
          };
        }
        return {
          stderr: "",
          stdout: "",
        };
      },
    });

    const state = await manager.probe();
    expect(state).toEqual({
      postgres: {
        status: "ready",
        summary: "postgres ready",
      },
      redis: {
        status: "degraded",
        summary: "redis unhealthy",
      },
    });
  });
});
