import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  hasEligibleChangesetEntries,
  listChangesetEntries,
} from "../../scripts/release/changeset-entries.mjs";

describe("changeset entry contract", () => {
  test("公开 package changeset 会被识别为 eligible entry", async () => {
    const changesetDir = await mkdtemp(join(tmpdir(), "carvis-changeset-entry-"));
    await writeFile(
      join(changesetDir, "public.md"),
      [
        "---",
        "\"@carvis/carvis-cli\": minor",
        "\"@carvis/core\": patch",
        "---",
        "",
        "发布一轮公开改动",
      ].join("\n"),
    );

    const entries = await listChangesetEntries(changesetDir);
    expect(entries).toEqual([
      expect.objectContaining({
        eligiblePackages: ["@carvis/carvis-cli", "@carvis/core"],
        packages: ["@carvis/carvis-cli", "@carvis/core"],
      }),
    ]);
    await expect(hasEligibleChangesetEntries(changesetDir)).resolves.toBe(true);

    await rm(changesetDir, { force: true, recursive: true });
  });

  test("只命中内部包或组外包的 changeset 不属于公开 release 输入", async () => {
    const changesetDir = await mkdtemp(join(tmpdir(), "carvis-changeset-entry-"));
    await writeFile(
      join(changesetDir, "internal.md"),
      [
        "---",
        "\"@carvis/skill-media-cli\": patch",
        "\"@carvis/not-in-release-group\": minor",
        "---",
        "",
        "内部变更",
      ].join("\n"),
    );

    const entries = await listChangesetEntries(changesetDir);
    expect(entries).toEqual([
      expect.objectContaining({
        eligiblePackages: [],
        packages: ["@carvis/skill-media-cli", "@carvis/not-in-release-group"],
      }),
    ]);
    await expect(hasEligibleChangesetEntries(changesetDir)).resolves.toBe(false);

    await rm(changesetDir, { force: true, recursive: true });
  });
});
