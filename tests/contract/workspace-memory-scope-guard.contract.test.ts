import { describe, expect, test } from "bun:test";

import { normalizeFeishuCommandText } from "../../packages/channel-feishu/src/command-normalization.ts";

describe("workspace memory scope guard", () => {
  test("does not introduce a /memory sync command surface", () => {
    const normalized = normalizeFeishuCommandText({
      text: "/memory sync",
      mentions: [],
    });

    expect(normalized.command).toBeNull();
    expect(normalized.unknownCommand).toBe("/memory");
    expect(normalized.prompt).toBeNull();
  });
});
