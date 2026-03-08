import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

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

    expect(existsSync(harness.paths.configFile)).toBe(true);
    expect(harness.env.HOME).toBe(harness.paths.homeDir);
    expect(readFileSync(harness.paths.configFile, "utf8")).toContain("\"agent\"");
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
