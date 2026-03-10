import { describe, expect, test } from "bun:test";

import { mapBlocksToFeishuCardElements } from "../../packages/channel-feishu/src/feishu-card-content-mapper.ts";
import { transformFeishuRichText } from "../../packages/channel-feishu/src/feishu-rich-text-transformer.ts";

describe("feishu rich text transformer", () => {
  test("streaming 模式保留标题、列表、强调、引用和图片结构", () => {
    const result = transformFeishuRichText({
      mode: "streaming",
      text: [
        "# 概览",
        "",
        "- **加粗**",
        "> 引用",
        "![架构图](https://example.com/a.png)",
        "`bun test`",
      ].join("\n"),
    });

    expect(result.outcome).toBe("normalized");
    expect(result.degradedFragments).toEqual([]);
    expect(mapBlocksToFeishuCardElements(result.blocks, "carvis-output")).toEqual([
      {
        element_id: "carvis-output",
        tag: "div",
        text: {
          tag: "lark_md",
          content: "**概览**\n\n• **加粗**\n│ 引用\n[图片: 架构图](https://example.com/a.png)\n[bun test]",
        },
      },
    ]);
  });

  test("streaming 模式会对未闭合代码块补齐稳定展示", () => {
    const result = transformFeishuRichText({
      mode: "streaming",
      text: ["# 命令", "", "```bash", "bun test"].join("\n"),
    });

    expect(result.outcome).toBe("normalized");
    expect(result.blocks).toEqual([
      {
        kind: "text",
        format: "lark_md",
        content: "**命令**",
      },
      {
        kind: "text",
        format: "plain_text",
        content: "[bash]\nbun test",
      },
    ]);
  });

  test("会转义未知 HTML/XML 标签并记录 degradedFragments", () => {
    const result = transformFeishuRichText({
      mode: "streaming",
      text: ["<div>bad</div>", "<xml><tag>bad</tag></xml>", "<font color='red'>ok</font>"].join("\n"),
    });

    expect(result.outcome).toBe("degraded");
    expect(result.degradedFragments).toEqual(["div", "xml", "tag"]);
    expect(result.blocks).toEqual([
      {
        kind: "text",
        format: "plain_text",
        content: "&lt;div&gt;bad&lt;/div&gt;\n&lt;xml&gt;&lt;tag&gt;bad&lt;/tag&gt;&lt;/xml&gt;\n<font color='red'>ok</font>",
      },
    ]);
  });

  test("代码块内的 HTML 标签保持原样，不应被适配层改写", () => {
    const result = transformFeishuRichText({
      mode: "streaming",
      text: ["```html", "<div>hi</div>", "```"].join("\n"),
    });

    expect(result.outcome).toBe("preserved");
    expect(result.degradedFragments).toEqual([]);
    expect(result.blocks).toEqual([
      {
        kind: "text",
        format: "plain_text",
        content: "[html]\n<div>hi</div>",
      },
    ]);
  });

  test("terminal 模式会按标题分段并在超长文本时按顺序拆块", () => {
    const result = transformFeishuRichText({
      mode: "terminal",
      maxBlockLength: 32,
      text: [
        "## 结论",
        "",
        "第一段内容很长，需要在保持顺序的前提下做最小必要切分。",
        "",
        "## 下一步",
        "",
        "1. bun test",
      ].join("\n"),
    });

    expect(result.outcome).toBe("normalized");
    expect(result.blocks[0]).toEqual({
      kind: "text",
      format: "lark_md",
      content: "**结论**",
    });
    expect(result.blocks[1]).toEqual({
      kind: "text",
      format: "plain_text",
      content: expect.any(String),
    });
    expect(result.blocks[2]).toEqual({
      kind: "text",
      format: "plain_text",
      content: expect.any(String),
    });
    expect(result.blocks[3]).toEqual({ kind: "rule" });
    expect(result.blocks[4]).toEqual({
      kind: "text",
      format: "lark_md",
      content: "**下一步**",
    });
    expect(result.blocks[5]).toEqual({
      kind: "text",
      format: "plain_text",
      content: "1. bun test",
    });
    const mergedConclusion = result.blocks
      .filter((block, index): block is Extract<(typeof result.blocks)[number], { kind: "text" }> => {
        return block.kind === "text" && index < 3;
      })
      .map((block) => block.content)
      .join("")
      .replace("**结论**", "");
    expect(mergedConclusion).toBe("第一段内容很长，需要在保持顺序的前提下做最小必要切分。");
  });

  test("terminal 模式拆分超长代码块时，每个 block 都保持合法 fenced code", () => {
    const result = transformFeishuRichText({
      mode: "terminal",
      maxBlockLength: 35,
      text: [
        "## Code",
        "",
        "```ts",
        "const alpha = 1;",
        "const beta = 2;",
        "const gamma = 3;",
        "```",
      ].join("\n"),
    });

    expect(result.blocks).toEqual([
      {
        kind: "text",
        format: "lark_md",
        content: "**Code**",
      },
      {
        kind: "text",
        format: "plain_text",
        content: "[ts]\nconst alpha = 1;",
      },
      {
        kind: "text",
        format: "plain_text",
        content: "[ts]\nconst beta = 2;",
      },
      {
        kind: "text",
        format: "plain_text",
        content: "[ts]\nconst gamma = 3;",
      },
    ]);
  });

  test("streaming 模式保留任务列表、嵌套列表和裸链接信息", () => {
    const result = transformFeishuRichText({
      mode: "streaming",
      text: [
        "# 待办",
        "",
        "- [x] 已完成",
        "- [ ] 未完成",
        "  - 子任务 https://example.com/task",
      ].join("\n"),
    });

    expect(result.outcome).toBe("normalized");
    expect(result.blocks).toEqual([
      {
        kind: "text",
        format: "lark_md",
        content: [
          "**待办**",
          "",
          "• [x] 已完成",
          "• [ ] 未完成",
          "  • 子任务 [https://example.com/task](https://example.com/task)",
        ].join("\n"),
      },
    ]);
  });

  test("streaming 模式会保留加粗和链接为受控 lark_md", () => {
    const result = transformFeishuRichText({
      mode: "streaming",
      text: [
        "# 样式",
        "",
        "- **加粗项**",
        "[文档链接](https://example.com/docs)",
        "https://example.com/raw-link",
        "![架构图](https://example.com/a.png)",
      ].join("\n"),
    });

    expect(mapBlocksToFeishuCardElements(result.blocks, "carvis-output")).toEqual([
      {
        element_id: "carvis-output",
        tag: "div",
        text: {
          tag: "lark_md",
          content: [
            "**样式**",
            "",
            "• **加粗项**",
            "[文档链接](https://example.com/docs)",
            "[https://example.com/raw-link](https://example.com/raw-link)",
            "[图片: 架构图](https://example.com/a.png)",
          ].join("\n"),
        },
      },
    ]);
  });

  test("streaming 模式会把 markdown 分割线转换成 rule block", () => {
    const result = transformFeishuRichText({
      mode: "streaming",
      text: [
        "# 第一段",
        "",
        "内容 A",
        "",
        "---",
        "",
        "# 第二段",
        "",
        "内容 B",
      ].join("\n"),
    });

    expect(result.outcome).toBe("normalized");
    expect(result.blocks).toEqual([
      {
        kind: "text",
        format: "lark_md",
        content: "**第一段**",
      },
      {
        kind: "text",
        format: "plain_text",
        content: "内容 A",
      },
      { kind: "rule" },
      {
        kind: "text",
        format: "lark_md",
        content: "**第二段**",
      },
      {
        kind: "text",
        format: "plain_text",
        content: "内容 B",
      },
    ]);
  });

  test("分割线 block 会映射为飞书 hr 元素", () => {
    const result = transformFeishuRichText({
      mode: "streaming",
      text: ["# 第一段", "", "内容 A", "", "---", "", "# 第二段", "", "内容 B"].join("\n"),
    });

    expect(mapBlocksToFeishuCardElements(result.blocks, "carvis-output")).toEqual([
      {
        element_id: "carvis-output",
        tag: "div",
        text: {
          tag: "lark_md",
          content: "**第一段**",
        },
      },
      {
        element_id: "carvis-output-section-1",
        tag: "div",
        text: {
          tag: "plain_text",
          content: "内容 A",
        },
      },
      { tag: "hr" },
      {
        element_id: "carvis-output-section-2",
        tag: "div",
        text: {
          tag: "lark_md",
          content: "**第二段**",
        },
      },
      {
        element_id: "carvis-output-section-3",
        tag: "div",
        text: {
          tag: "plain_text",
          content: "内容 B",
        },
      },
    ]);
  });

  test("streaming 模式会把 markdown 表格稳定化为纯文本表格，且不丢列信息", () => {
    const result = transformFeishuRichText({
      mode: "streaming",
      text: [
        "# 表格",
        "",
        "| 语法 | 输出 |",
        "| --- | --- |",
        "| 链接 | 保留 URL |",
        "| 图片 | 保留 alt 与 URL |",
      ].join("\n"),
    });

    expect(result.outcome).toBe("normalized");
    expect(result.blocks).toEqual([
      {
        kind: "text",
        format: "lark_md",
        content: "**表格**",
      },
      {
        kind: "text",
        format: "plain_text",
        content: ["语法 | 输出", "链接 | 保留 URL", "图片 | 保留 alt 与 URL"].join("\n"),
      },
    ]);
  });

  test("terminal 模式拆分超长受控 lark_md 时不会截断链接语法", () => {
    const result = transformFeishuRichText({
      mode: "terminal",
      maxBlockLength: 24,
      text: [
        "# 链接区",
        "",
        "[超长文档链接](https://example.com/docs/very/long/path/that/should/not/be/broken)",
      ].join("\n"),
    });

    expect(result.blocks).toEqual([
      {
        kind: "text",
        format: "lark_md",
        content: "**链接区**\n\n[超长文档链接](https://example.com/docs/very/long/path/that/should/not/be/broken)",
      },
    ]);
  });

  test("标题后直接分割线时仍输出加粗标题", () => {
    const result = transformFeishuRichText({
      mode: "streaming",
      text: ["# 标题", "", "---", "", "正文"].join("\n"),
    });

    expect(result.blocks).toEqual([
      {
        kind: "text",
        format: "lark_md",
        content: "**标题**",
      },
      { kind: "rule" },
      {
        kind: "text",
        format: "plain_text",
        content: "正文",
      },
    ]);
  });
});
