import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveCarvisRuntimeFileSet } from "../../packages/carvis-cli/src/config-writer.ts";

type MockSpawnCall = {
  cmd: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
};

export async function createCarvisCliHarness() {
  const homeDir = await mkdtemp(join(tmpdir(), "carvis-cli-"));
  const workspacePath = join(homeDir, "workspace-main");
  const fileSet = resolveCarvisRuntimeFileSet({
    homeDir,
  });
  const spawnCalls: MockSpawnCall[] = [];

  await mkdir(workspacePath, { recursive: true });
  await mkdir(fileSet.logsDir, { recursive: true });
  await mkdir(fileSet.stateDir, { recursive: true });

  return {
    async cleanup() {
      await rm(homeDir, {
        force: true,
        recursive: true,
      });
    },
    fileSet,
    homeDir,
    mockSpawn(call: MockSpawnCall) {
      spawnCalls.push(call);
      return {
        kill() {},
        pid: 9999,
      };
    },
    spawnCalls,
    async writeRuntimeEnv(lines: string[]) {
      await writeFile(fileSet.runtimeEnvPath, `${lines.join("\n")}\n`);
    },
    workspacePath,
  };
}
