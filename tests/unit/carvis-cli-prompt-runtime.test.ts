import { describe, expect, test } from "bun:test";

import { formatPromptNote } from "../../packages/carvis-cli/src/prompt-runtime.ts";

describe("carvis cli prompt runtime", () => {
  test("note 会高亮标题、环境变量和关键词", () => {
    const rendered = formatPromptNote(
      [
        "填写 FEISHU_APP_ID 和 App Secret。",
        "后续可以收敛到 chat_id。",
      ].join("\n"),
      "Feishu App ID",
      {
        env: {},
        hyperlinkSupported: false,
      },
    );

    expect(rendered).toContain("\u001b[1m");
    expect(rendered).toContain("FEISHU_APP_ID");
    expect(rendered).toContain("App Secret");
    expect(rendered).toContain("chat_id");
  });

  test("支持超链接时会输出 OSC 8 链接", () => {
    const rendered = formatPromptNote(
      "控制台: https://open.feishu.cn/app",
      "Feishu App ID",
      {
        env: {},
        hyperlinkSupported: true,
      },
    );

    expect(rendered).toContain("\u001b]8;;https://open.feishu.cn/app\u0007");
    expect(rendered).toContain("https://open.feishu.cn/app");
  });

  test("不支持超链接时回退为普通 URL 文本", () => {
    const rendered = formatPromptNote(
      "控制台: https://open.feishu.cn/app",
      "Feishu App ID",
      {
        env: {},
        hyperlinkSupported: false,
      },
    );

    expect(rendered).not.toContain("\u001b]8;;");
    expect(rendered).toContain("https://open.feishu.cn/app");
  });
});
