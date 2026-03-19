import { describe, expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

import { runCarvisCli } from "../../packages/carvis-cli/src/index.ts";
import { createCarvisDaemonHarness } from "../support/carvis-daemon-harness.ts";

describe("carvis uninstall", () => {
  test("默认 uninstall 会停止 daemon 和 infra，但保留数据目录", async () => {
    const harness = await createCarvisDaemonHarness();

    await runCarvisCli(["install"], {
      env: harness.env,
    });
    await runCarvisCli(["daemon", "start"], {
      env: harness.env,
    });

    const markerPath = join(harness.layout.dataDir, "postgres", "marker.txt");
    await Bun.write(markerPath, "keep");

    const exitCode = await runCarvisCli(["uninstall"], {
      env: harness.env,
    });

    expect(exitCode).toBe(0);
    await access(markerPath, constants.F_OK);
    await expect(access(harness.layout.installManifestPath, constants.F_OK)).rejects.toThrow();
    const dockerState = await readFile(harness.dockerStatePath, "utf8");
    expect(dockerState).toContain("postgres=stopped");
    expect(dockerState).toContain("redis=stopped");

    await harness.cleanup();
  });

  test("purge 会额外删除 data 和 state", async () => {
    const harness = await createCarvisDaemonHarness();

    await runCarvisCli(["install"], {
      env: harness.env,
    });
    await runCarvisCli(["daemon", "start"], {
      env: harness.env,
    });
    await Bun.write(join(harness.layout.dataDir, "postgres", "marker.txt"), "purge");
    await Bun.write(join(harness.layout.stateDir, "marker.json"), "{}");

    const exitCode = await runCarvisCli(["uninstall", "--purge"], {
      env: harness.env,
    });

    expect(exitCode).toBe(0);
    await expect(access(harness.layout.dataDir, constants.F_OK)).rejects.toThrow();
    await expect(access(harness.layout.stateDir, constants.F_OK)).rejects.toThrow();

    await harness.cleanup();
  });
});
