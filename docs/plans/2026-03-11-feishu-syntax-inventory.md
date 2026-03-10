# Feishu 稳定文本语法清单

## 目标

在飞书卡片中优先保证：

1. 不丢信息
2. 输出稳定
3. 不依赖 `lark_md` 对复杂 Markdown 的解释结果

当前阶段以稳定文本渲染为主；图片和超链接后续可升级为卡片原生组件，但在此之前至少要完整保留原始信息。

## 语法清单

| 输入语法 | 例子 | 期望稳定输出 |
| --- | --- | --- |
| 标题 | `# 概览` | `概览`，terminal 模式按 section 切分 |
| 无序列表 | `- item` | `• item` |
| 有序列表 | `1. item` | `1. item` |
| 任务列表 | `- [x] done` | `• [x] done` |
| 嵌套列表 | `  - child` | 保留层级缩进，不丢层级信息 |
| 引用 | `> quote` | `│ quote` |
| 行内代码 | `` `bun test` `` | `[bun test]` |
| 围栏代码 | ```` ```bash ```` | `[bash]` + 原代码正文 |
| 未闭合围栏代码 | ```` ```bash ```` 未闭合 | 仍输出 `[bash]` + 已有正文 |
| Markdown 链接 | `[文档](https://a.com)` | `文档 (https://a.com)` |
| 裸链接 | `https://a.com` | 原样保留链接文本 |
| Markdown 图片 | `![架构图](https://a.com/x.png)` | 至少保留 `图片: 架构图 (https://a.com/x.png)` |
| 裸图片链接 | `https://a.com/x.png` | 原样保留链接文本 |
| 分割线 | `---` | 映射为卡片 `rule`，不作为普通文本保留 |
| 表格 | `| a | b |` | 保留表头和单元格内容，不丢列信息 |
| 强调 | `**bold**` / `_it_` / `~~del~~` | 去语法标记，保留文本 |
| HTML 标签 | `<div>bad</div>` | 非白名单标签转义，内容保留 |
| 代码块内 HTML | ```` ```html ```` | 块内 HTML 原样保留 |

## 当前缺口

1. 分割线还未识别为独立 `rule`
2. 嵌套列表缩进未保留
3. 表格仍按原始 Markdown 行透传，缺少稳定文本归一化
4. 图片目前只做文本兜底，未升级为可点击链接或卡片图片元素

## 测试策略

1. `transformFeishuRichText` 负责语法级转换覆盖
2. `mapBlocksToFeishuCardElements` 负责 block 到卡片元素映射
3. `runtime-sender` 负责真实发送载荷中不丢信息
