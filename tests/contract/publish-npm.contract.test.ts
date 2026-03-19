import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { publishReleasePackages } from "../../scripts/release/publish-npm.mjs";

async function createFakeNpmCli(rootDir: string, existingSpecs: string[]) {
  const binDir = join(rootDir, "bin");
  const logFile = join(rootDir, "npm.log");
  const existingSpecArgs = existingSpecs.join("|");
  await mkdir(binDir, { recursive: true });

  const scriptPath = join(binDir, "npm");
  await writeFile(
    scriptPath,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "${logFile}"
case "$1" in
  whoami)
    echo "ci-user"
    ;;
  view)
    if [[ "${existingSpecArgs}" == *"$2"* ]]; then
      echo "$2"
      exit 0
    fi
    exit 1
    ;;
  publish)
    echo "published"
    ;;
  *)
    echo "unexpected npm command: $*" >&2
    exit 9
    ;;
esac
`,
  );
  await chmod(scriptPath, 0o755);

  return { logFile, npmCli: scriptPath };
}

describe("publish npm contract", () => {
  test("已存在版本必须标记为 skipped_existing_version 且不再次 publish", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "carvis-release-publish-"));
    const summaryFile = join(rootDir, "release-summary.json");
    await mkdir(join(rootDir, "packages", "core"), { recursive: true });
    await mkdir(join(rootDir, "packages", "channel-feishu"), { recursive: true });
    await writeFile(
      join(rootDir, "packages", "core", "package.json"),
      JSON.stringify({
        name: "@carvis/core",
        version: "1.2.3",
        private: false,
      }),
    );
    await writeFile(
      join(rootDir, "packages", "channel-feishu", "package.json"),
      JSON.stringify({
        name: "@carvis/channel-feishu",
        version: "1.2.3",
        private: false,
      }),
    );
    const { logFile, npmCli } = await createFakeNpmCli(rootDir, [
      "@carvis/core@1.2.3",
    ]);

    const result = await publishReleasePackages({
      npmCli,
      rootDir,
      summaryFile,
      allowLogin: false,
    });

    expect(result.status).toBe("published");
    expect(result.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "@carvis/core",
          status: "skipped_existing_version",
        }),
        expect.objectContaining({
          name: "@carvis/channel-feishu",
          status: "published",
        }),
      ]),
    );

    const log = await readFile(logFile, "utf8");
    expect(log).toContain("view @carvis/core@1.2.3 version");
    expect(log).toContain("publish --access public");

    const summary = JSON.parse(await readFile(summaryFile, "utf8"));
    expect(summary.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "@carvis/core",
          status: "skipped_existing_version",
        }),
        expect.objectContaining({
          name: "@carvis/channel-feishu",
          status: "published",
        }),
      ]),
    );

    await rm(rootDir, { force: true, recursive: true });
  });

  test("private package 不得出现在发布结果中", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "carvis-release-private-"));
    await mkdir(join(rootDir, "packages", "core"), { recursive: true });
    await mkdir(join(rootDir, "packages", "private-skill"), { recursive: true });
    await writeFile(
      join(rootDir, "packages", "core", "package.json"),
      JSON.stringify({
        name: "@carvis/core",
        version: "0.1.2",
        private: false,
      }),
    );
    await writeFile(
      join(rootDir, "packages", "private-skill", "package.json"),
      JSON.stringify({
        name: "@carvis/skill-media-cli",
        version: "0.1.2",
        private: true,
      }),
    );

    const summaryFile = join(rootDir, "release-summary.json");
    const { npmCli } = await createFakeNpmCli(rootDir, []);
    const result = await publishReleasePackages({
      npmCli,
      rootDir,
      summaryFile,
      allowLogin: false,
    });

    expect(result.results.map((entry) => entry.name)).toEqual(["@carvis/core"]);
    expect(result.results.map((entry) => entry.status)).toEqual(["published"]);

    await rm(rootDir, { force: true, recursive: true });
  });
});
