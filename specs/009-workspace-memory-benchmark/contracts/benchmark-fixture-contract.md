# Benchmark Fixture Contract

## 目的

定义 workspace memory benchmark 输入样例的结构化契约，确保开发者新增样例时格式一致、可被 runner 和 scorer 稳定消费。

## Contract

### 顶层字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 样例唯一 ID |
| `suite` | 是 | `L1-golden`、`L2-replay`、`L3-adversarial` |
| `workspaceKey` | 是 | 逻辑 workspace 标识 |
| `transcript` | 是 | 输入消息数组 |
| `expectation` | 是 | gold expectation |
| `notes` | 否 | 补充说明 |

### transcript 元素

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `role` | 是 | `user` 或其他受控输入来源 |
| `text` | 是 | 文本内容 |
| `chatId` | 否 | 覆盖默认 chat |
| `messageId` | 否 | 固定消息 ID |
| `metadata` | 否 | 其他前置条件 |

### expectation 字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `intent` | 条件必填 | 涉及分类时必须提供 |
| `expectedWrites` | 否 | 期望 durable write 摘要 |
| `recalledItemTitles` | 条件必填 | 涉及 recall 时至少提供一项 |
| `forbiddenItemTitles` | 条件必填 | 涉及误召回或误写场景时至少提供一项 |
| `gateCritical` | 否 | 是否属于 gate 红线样例 |

## 校验规则

1. `id` 必须全局唯一。
2. `suite` 只能取约定值。
3. `transcript` 不得为空。
4. `expectation` 不得缺失。
5. 若 `intent = not_memory`，则 `expectedWrites` 应为空。
6. 若样例目标是验证“不得召回旧事实”，必须提供 `forbiddenItemTitles`。

## 示例

```json
{
  "id": "golden-natural-language-remember-preference",
  "suite": "L1-golden",
  "workspaceKey": "main",
  "transcript": [
    {
      "role": "user",
      "messageId": "msg-001",
      "text": "记住这个，以后默认先给结论再给细节"
    },
    {
      "role": "user",
      "messageId": "msg-002",
      "text": "现在总结一下这个方案"
    }
  ],
  "expectation": {
    "intent": "remember",
    "recalledItemTitles": ["owner-preferences"],
    "forbiddenItemTitles": [],
    "gateCritical": true
  }
}
```
