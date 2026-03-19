import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const ROOT_DIR = fileURLToPath(new URL("../..", import.meta.url));

describe("media skill document", () => {
  test("定义单一主流程、失败即停和具体示例", async () => {
    const text = await Bun.file(
      `${ROOT_DIR}/packages/skill-media-cli/SKILL.md`,
    ).text();

    expect(text).toContain("If the user says \"把截图发给我\", call `carvis-media send --path <path> --media-kind image`.");
    expect(text).toContain("If the user says \"把这个文件直接发出来\", call `carvis-media send --path <path> --media-kind file`.");
    expect(text).toContain("Try `carvis-media send` once.");
    expect(text).toContain("If the first attempt fails, stop and tell the user media delivery is currently unavailable.");
    expect(text).toContain("Do not search the repo, switch worktrees, wrap the command with `bun`, or manually fill runtime context after a failed send attempt.");
  });
});
