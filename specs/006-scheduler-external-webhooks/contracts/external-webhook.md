# 合同：External Webhook Ingress

## 1. 路由与 definition 匹配

- 系统必须暴露一个按 definition `slug` 匹配的 external webhook HTTP 入口
- 只有预注册且启用中的 `ExternalWebhookDefinition` 可以被命中
- 命中未知 `slug`、已禁用 definition 或已删除 definition 的请求必须被同步拒绝

## 2. 请求鉴权

- 每个 definition 必须拥有独立 secret
- 请求必须携带原始请求体签名和时间戳
- 当签名无效、时间戳超出允许窗口或缺少必需鉴权头时，系统必须拒绝请求且不得创建 run

## 3. payload 校验

- definition 必须声明允许接收的 payload 字段约束
- 缺少必填字段、字段类型无效或包含不被允许的结构时，请求必须被拒绝
- payload 只能作为模板变量注入 `promptTemplate`
- payload 不得覆盖 definition 绑定的 `workspace`、`agentId`、`deliveryTarget` 或 `enabled`

## 4. 同步响应

### accepted

- 合法请求必须返回同步 accepted 结果
- accepted 响应必须至少包含：
  - `ok`
  - `executionId`
  - `definitionId` 或稳定 `slug`
  - `status = accepted`

### rejected

- 非法请求必须返回同步 rejected 结果
- rejected 响应必须至少包含：
  - `ok = false`
  - `status = rejected`
  - `reason`

## 5. 持久化与异步执行

- 每个 accepted 请求必须创建一条 `TriggerExecution`
- 只有 accepted 请求才能进一步创建 `Run`
- run 终态必须能从 `TriggerExecution` 反查
- webhook 请求本身的 accepted 并不表示 run 已成功，只表示已通过入口校验并进入异步执行链路
