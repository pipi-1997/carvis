# 数据模型：Feishu 稳定富文本适配

## 概览

本功能不引入新的持久化业务实体，也不改变 `Run`、`RunEvent`、`RunPresentation`、`OutboundDelivery` 的生命周期。新增内容主要是 `packages/channel-feishu` 内部的渲染中间模型，用于把上游累计文本转换为飞书稳定可渲染的卡片元素。

## `FeishuTransformRequest`

- **作用**: 表示一次 Feishu 富文本稳定化转换的输入。
- **关键字段**:
  - `mode`: `streaming` | `terminal`
  - `text`: 当前累计完整文本
  - `elementBaseId`: 输出区域基础标识
  - `title`: 卡片标题或 section 上下文（如适用）
- **约束**:
  - `text` 代表当前用户可见的完整累计文本，而不是单条 delta。
  - `mode` 只影响少量策略差异，不改变主流程。

## `RenderableBlock`

- **作用**: 表示转换层解析后的中间 block。
- **建议类型**:
  - `paragraph`
  - `section_heading`
  - `list`
  - `code_block`
  - `quote`
  - `table`
  - `image`
  - `rule`
  - `raw_text`
- **关键字段**:
  - `kind`
  - `content`
  - `sourceRange`
  - `isDegraded`
- **约束**:
  - block 顺序必须保持与原始文本阅读顺序一致。
  - 对不稳定语法降级后，`kind` 仍需明确指示这是原样保留还是降级表达。

## `TransformationOutcome`

- **作用**: 表示一次转换的结果语义，用于日志、测试与必要的 delivery/presentation 说明。
- **建议类型**:
  - `preserved`
  - `normalized`
  - `degraded`
  - `fallback_required`
- **关键字段**:
  - `mode`
  - `outcome`
  - `degradedFragments`
  - `warnings`
- **约束**:
  - `degraded` 只表示内容渲染降级，不等同于卡片发送失败。
  - `fallback_required` 只在卡片链路失败且用户侧尚无成功交付时进入兜底发送判断。

## `FeishuCardRenderable`

- **作用**: 表示最终可发送给 Feishu `interactive` 卡片的稳定元素集合。
- **关键字段**:
  - `elements`
  - `primaryElementId`
  - `sectionCount`
  - `outcome`
- **约束**:
  - 元素必须只包含飞书稳定支持的卡片结构。
  - 未知、未闭合或明显不支持的标签不得原样透传到最终元素中。
  - 标题 section 需统一归一化，不依赖原始 Markdown 标题语法稳定生效。

## `RunPresentation`（复用，不新增状态）

- **作用**: 继续表示某次运行在 Feishu 侧的整体呈现状态。
- **本轮变化**:
  - 不新增状态枚举。
  - 继续依赖 `phase`、`streamingCardId`、`streamingElementId`、`lastOutputExcerpt` 等字段承载用户可见进度。
- **约束**:
  - 渲染稳定化失败不应引入新的 run lifecycle。
  - 仅当卡片发送或更新本身失败时，才进入既有 `degraded` 处理语义。

## `OutboundDelivery`（复用）

- **作用**: 继续记录出站交付尝试。
- **本轮变化**:
  - 不必新增交付类型。
  - 需要保证现有 `card_create`、`card_update`、`card_complete`、`fallback_terminal` 足以区分转换后正常送达和链路失败兜底。
- **约束**:
  - 内容转换降级本身不应伪装为 delivery 失败。
  - 真正的发送失败、更新失败、终态增强失败仍通过现有 delivery 失败记录体现。

## 状态与边界总结

1. `bridge-codex`:
   - 继续输出规范 `RunEvent`
   - 不携带 Feishu 专属渲染结构
2. `apps/gateway`:
   - 继续累计 `visibleText`
   - 不生成 Feishu 专属 block
3. `packages/channel-feishu`:
   - 新增 `FeishuTransformRequest -> RenderableBlock -> FeishuCardRenderable` 转换主流程
   - 在 `createCard` / `updateCard` / `completeCard` 内统一调用
4. 持久化层:
   - 无新增 schema 要求
   - 复用既有 `RunPresentation` / `OutboundDelivery` 体现 operator-visible outcome
