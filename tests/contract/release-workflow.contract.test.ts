import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  RELEASE_GROUP_PACKAGES,
  hasEligibleChangesetEntries,
} from "../../scripts/release/changeset-entries.mjs";

describe("release workflow contract", () => {
  test("只有命中公开 release group 的 changeset 才能推动 release PR", async () => {
    const changesetDir = await mkdtemp(join(tmpdir(), "carvis-release-changesets-"));

    await writeFile(
      join(changesetDir, "eligible.md"),
      [
        "---",
        "\"@carvis/core\": patch",
        "---",
        "",
        "为 core 补一个公开 patch",
      ].join("\n"),
    );
    await writeFile(
      join(changesetDir, "ineligible.md"),
      [
        "---",
        "\"@carvis/skill-media-cli\": patch",
        "---",
        "",
        "内部包改动",
      ].join("\n"),
    );

    await expect(
      hasEligibleChangesetEntries(changesetDir, RELEASE_GROUP_PACKAGES),
    ).resolves.toBe(true);

    await rm(changesetDir, { force: true, recursive: true });
  });

  test("仅 docs-only、internal-only 或组外 package 的 changeset 不得触发公开 release PR", async () => {
    const changesetDir = await mkdtemp(join(tmpdir(), "carvis-release-changesets-"));
    await mkdir(changesetDir, { recursive: true });

    await writeFile(
      join(changesetDir, "internal-only.md"),
      [
        "---",
        "\"@carvis/skill-media-cli\": patch",
        "\"@carvis/carvis-media-cli\": patch",
        "\"@carvis/not-in-release-group\": minor",
        "---",
        "",
        "这轮改动不应该推动公开 release PR",
      ].join("\n"),
    );

    await expect(
      hasEligibleChangesetEntries(changesetDir, RELEASE_GROUP_PACKAGES),
    ).resolves.toBe(false);

    await rm(changesetDir, { force: true, recursive: true });
  });
});
