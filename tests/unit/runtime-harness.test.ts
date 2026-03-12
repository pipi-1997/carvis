import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { createRuntimeHarness } from "../support/runtime-harness.ts";

describe("runtime harness", () => {
  const cleanupCallbacks: Array<() => Promise<void> | void> = [];

  afterEach(async () => {
    while (cleanupCallbacks.length > 0) {
      const cleanup = cleanupCallbacks.pop();
      await cleanup?.();
    }
  });

  test("创建临时配置目录并注入运行时环境变量", async () => {
    const harness = await createRuntimeHarness();
    cleanupCallbacks.push(harness.cleanup);
    const config = JSON.parse(readFileSync(harness.paths.configFile, "utf8")) as {
      agent: { defaultWorkspace: string };
      workspaceResolver: { registry: Record<string, string> };
    };

    expect(existsSync(harness.paths.configFile)).toBe(true);
    expect(harness.env.HOME).toBe(harness.paths.homeDir);
    expect(config.agent.defaultWorkspace).toBe("main");
    expect(config.workspaceResolver.registry.main).toBeDefined();
    expect(config.workspaceResolver.registry.main).toBe(join(harness.paths.managedWorkspaceRoot, "main"));
    expect(existsSync(join(harness.paths.templateDir, ".gitignore"))).toBe(true);
    expect(existsSync(join(harness.paths.templateDir, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(harness.paths.templateDir, ".carvis", "MEMORY.md"))).toBe(true);
    expect(existsSync(join(harness.paths.templateDir, ".carvis", "memory", "README.md"))).toBe(true);
    expect(harness.env.FEISHU_APP_ID).toBe("cli_test_app");
    expect(harness.env.POSTGRES_URL).toContain("carvis_test");
  });

  test("支持注入过程卡片创建和更新失败开关", async () => {
    const harness = await createRuntimeHarness({
      presentation: {
        failCardCreate: true,
        failCardUpdate: true,
      },
    });
    cleanupCallbacks.push(harness.cleanup);

    expect(harness.env.CARVIS_FAIL_CARD_CREATE).toBe("1");
    expect(harness.env.CARVIS_FAIL_CARD_UPDATE).toBe("1");
  });
});
