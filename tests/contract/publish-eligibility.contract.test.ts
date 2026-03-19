import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  RELEASE_GROUP_PACKAGES,
  listPublishableWorkspaces,
} from "../../scripts/release/publishable-workspaces.mjs";

describe("publish eligibility contract", () => {
  test("当前公开 release group 快照锁定为 7 个 package，carvis-media-cli 不再公开发版", async () => {
    const result = await listPublishableWorkspaces(process.cwd());

    const eligibleNames = result
      .filter((entry) => entry.eligible)
      .map((entry) => entry.name);

    expect(eligibleNames).toEqual(RELEASE_GROUP_PACKAGES);
    expect(eligibleNames).toHaveLength(7);
    expect(eligibleNames).not.toContain("@carvis/carvis-media-cli");
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eligible: false,
          ineligibilityReason: "private_package",
          name: "@carvis/carvis-media-cli",
        }),
      ]),
    );
  });

  test("private package、缺失 version package 与组外 package 必须被明确排除", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "carvis-release-eligibility-"));
    await mkdir(join(rootDir, "packages", "public-one"), { recursive: true });
    await mkdir(join(rootDir, "packages", "private-one"), { recursive: true });
    await mkdir(join(rootDir, "packages", "missing-version"), { recursive: true });
    await mkdir(join(rootDir, "packages", "outside-group"), { recursive: true });

    await writeFile(
      join(rootDir, "packages", "public-one", "package.json"),
      JSON.stringify({
        name: "@carvis/core",
        version: "1.2.3",
        private: false,
      }),
    );
    await writeFile(
      join(rootDir, "packages", "private-one", "package.json"),
      JSON.stringify({
        name: "@carvis/skill-media-cli",
        version: "1.2.3",
        private: true,
      }),
    );
    await writeFile(
      join(rootDir, "packages", "missing-version", "package.json"),
      JSON.stringify({
        name: "@carvis/skill-schedule-cli",
        private: true,
      }),
    );
    await writeFile(
      join(rootDir, "packages", "outside-group", "package.json"),
      JSON.stringify({
        name: "@carvis/not-in-release-group",
        version: "9.9.9",
        private: false,
      }),
    );

    const result = await listPublishableWorkspaces(rootDir);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eligible: true,
          ineligibilityReason: null,
          name: "@carvis/core",
        }),
        expect.objectContaining({
          eligible: false,
          ineligibilityReason: "private_package",
          name: "@carvis/skill-media-cli",
        }),
        expect.objectContaining({
          eligible: false,
          ineligibilityReason: "missing_version",
          name: "@carvis/skill-schedule-cli",
        }),
        expect.objectContaining({
          eligible: false,
          ineligibilityReason: "outside_release_group",
          name: "@carvis/not-in-release-group",
        }),
      ]),
    );

    await rm(rootDir, { force: true, recursive: true });
  });
});
