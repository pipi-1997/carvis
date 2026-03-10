# 合同：Feishu 渲染边界与发送职责

## 1. 边界责任

- `bridge-codex` 只负责输出规范 `RunEvent`，不负责生成任何 Feishu 渲染结构。
- `apps/gateway` 只负责把 `RunEvent` 映射为呈现动作，并维护累计文本窗口；不负责生成 Feishu 专属富文本表达。
- `packages/channel-feishu` 负责把上游累计文本转换为飞书稳定可渲染的卡片结构，并执行实际发送。

## 2. Sender 职责

- `createCard` 必须使用稳定化转换后的初始内容创建过程卡片。
- `updateCard` 必须在每次更新时对当前累计文本重新执行稳定化转换，而不是简单拼接或盲目透传。
- `completeCard` 必须使用同一套转换主流程处理终态内容，并继续维持单消息卡片语义。

## 3. 失败语义

- 内容转换降级不等于卡片发送失败。
- 只有当 Feishu 卡片创建、更新或完成态切换的实际发送失败时，才进入现有 `degraded` / `fallback_terminal` 语义。
- 当过程卡片已成功创建时，失败恢复不得通过新增第二条成功终态消息完成。

## 4. 可验证结果

- 对包含复杂 Markdown / HTML / XML 片段的输入，sender 最终发送的卡片结构必须仍然是飞书稳定支持的元素集合。
- 对同一段输入，`streaming` 和 `terminal` 模式的结果必须保持核心结构语义一致，仅允许在残缺结构容错与 section 拆分粒度上有差异。
