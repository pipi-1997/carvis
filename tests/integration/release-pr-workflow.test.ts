import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("release PR workflow", () => {
  test("workflow 使用 changesets action 维护单一 release PR，并以 eligible changeset 为唯一门槛", async () => {
    const workflow = await readFile(
      "/Users/pipi/workspace/carvis-release-automation/.github/workflows/release.yml",
      "utf8",
    );

    expect(workflow).toContain("changesets/action");
    expect(workflow).toContain("bun run release:version");
    expect(workflow).toContain("hasChangesets");
    expect(workflow).toContain("bun run release:publish");
    expect(workflow).toContain("eligible changeset");
  });
});
