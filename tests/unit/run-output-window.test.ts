import { describe, expect, test } from "bun:test";

import { createRunOutputWindow } from "../../apps/gateway/src/services/run-output-window.ts";

describe("run output window", () => {
  test("按 sequence 合并输出并忽略重复 sequence", () => {
    const window = createRunOutputWindow();

    const first = window.appendDelta({
      sequence: 1,
      text: "正在分析仓库",
    });
    const duplicate = window.appendDelta({
      sequence: 1,
      text: "正在分析仓库",
    });
    const second = window.appendDelta({
      sequence: 2,
      text: "正在修改文件",
    });

    expect(first?.visibleText).toBe("正在分析仓库");
    expect(duplicate).toBeNull();
    expect(second?.visibleText).toContain("正在分析仓库");
    expect(second?.visibleText).toContain("正在修改文件");
    expect(second?.lastRenderedSequence).toBe(2);
    expect(second?.excerpt).toBe("正在修改文件");
  });

  test("对超长内容做滑动截断并保留最近 excerpt", () => {
    const window = createRunOutputWindow({
      maxChars: 16,
    });

    const state = window.appendDelta({
      sequence: 1,
      text: "1234567890abcdef",
    });
    const truncated = window.appendDelta({
      sequence: 2,
      text: "XYZ",
    });

    expect(state?.visibleText).toBe("1234567890abcdef");
    expect(truncated?.visibleText).toBe("4567890abcdefXYZ");
    expect(truncated?.excerpt).toBe("XYZ");
  });
});
