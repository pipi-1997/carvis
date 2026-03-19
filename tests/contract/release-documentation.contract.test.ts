import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function read(path: string) {
  return await readFile(path, "utf8");
}

describe("release documentation contract", () => {
  test("AGENTS、onboarding 和 runbook 必须明确 changeset + release PR + trusted publishing 规则", async () => {
    const agents = await read("/Users/pipi/workspace/carvis-release-automation/AGENTS.md");
    const onboarding = await read("/Users/pipi/workspace/carvis-release-automation/docs/guides/developer-onboarding.md");
    const runbook = await read("/Users/pipi/workspace/carvis-release-automation/docs/runbooks/release-management.md");

    expect(agents).toContain("release PR");
    expect(agents).toContain("changeset");
    expect(agents).toContain("trusted publishing");
    expect(onboarding).toContain("release PR");
    expect(onboarding).toContain("changeset");
    expect(onboarding).toContain("trusted publishing");
    expect(runbook).toContain("release PR");
    expect(runbook).toContain("trusted publishing");
    expect(runbook).toContain("workflow rerun");
  });

  test("AGENTS、onboarding 和 runbook 必须明确 carvis-media-cli 是内部 transport CLI，不参与公开发版", async () => {
    const agents = await read("/Users/pipi/workspace/carvis-release-automation/AGENTS.md");
    const onboarding = await read("/Users/pipi/workspace/carvis-release-automation/docs/guides/developer-onboarding.md");
    const runbook = await read("/Users/pipi/workspace/carvis-release-automation/docs/runbooks/release-management.md");

    expect(agents).toContain("carvis-media-cli");
    expect(agents).toContain("不参与 npm 公开发布");
    expect(onboarding).toContain("carvis-media-cli");
    expect(onboarding).toContain("不参与 npm 公开发布");
    expect(runbook).toContain("carvis-media-cli");
    expect(runbook).toContain("不参与 npm 公开发布");
  });

  test("现有 AI 入口指导文件必须同步 release 规则", async () => {
    const cursorRules = await read("/Users/pipi/workspace/carvis-release-automation/.cursor/rules/specify-rules.mdc");
    const codexReadme = await read("/Users/pipi/workspace/carvis-release-automation/.codex/README.md");

    expect(cursorRules).toContain("release PR");
    expect(cursorRules).toContain("changeset");
    expect(cursorRules).toContain("trusted publishing");
    expect(codexReadme).toContain("release PR");
    expect(codexReadme).toContain("changeset");
    expect(codexReadme).toContain("trusted publishing");
  });

  test("现有 AI 入口指导文件必须同步 carvis-media-cli 内部包规则", async () => {
    const cursorRules = await read("/Users/pipi/workspace/carvis-release-automation/.cursor/rules/specify-rules.mdc");
    const codexReadme = await read("/Users/pipi/workspace/carvis-release-automation/.codex/README.md");

    expect(cursorRules).toContain("carvis-media-cli");
    expect(cursorRules).toContain("不参与 npm 公开发布");
    expect(codexReadme).toContain("carvis-media-cli");
    expect(codexReadme).toContain("不参与 npm 公开发布");
  });
});
