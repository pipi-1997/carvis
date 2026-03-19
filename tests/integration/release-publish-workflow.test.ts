import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("release publish workflow", () => {
  test("release PR 合并后的 workflow 会生成 summary、artifact、tag 和 GitHub release", async () => {
    const workflow = await readFile(
      "/Users/pipi/workspace/carvis-release-automation/.github/workflows/release.yml",
      "utf8",
    );

    expect(workflow).toContain("CARVIS_RELEASE_SUMMARY_FILE");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
    expect(workflow).toContain("actions/upload-artifact");
    expect(workflow).toContain("Create git tag");
    expect(workflow).toContain("actions/github-script");
  });

  test("workflow 使用 trusted publishing 而不是 NPM_TOKEN secret", async () => {
    const workflow = await readFile(
      "/Users/pipi/workspace/carvis-release-automation/.github/workflows/release.yml",
      "utf8",
    );

    expect(workflow).toContain("id-token: write");
    expect(workflow).not.toContain("NPM_TOKEN");
  });
});
