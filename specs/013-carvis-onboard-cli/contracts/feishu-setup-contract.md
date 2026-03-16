# 合同：Feishu Setup / Doctor 接口

## 目标

定义 `packages/channel-feishu` 提供给 `carvis` 总入口 CLI 的 setup/doctor 能力边界。

## 必须暴露的能力

### `getFeishuSetupSpec()`

返回值必须包含：

- 适配器标识 `feishu`
- 接入模式 `websocket`
- 必填字段列表
- 默认值
- 每个字段的人类可读说明
- 每个字段的获取指引

### `validateFeishuSetupInput(input)`

必须校验：

- `appId` 非空
- `appSecret` 非空
- `allowFrom` 非空数组
- `requireMention` 为布尔值

输出必须稳定区分 `ok` 与 `errors[]`。

### `probeFeishuCredentials({ appId, appSecret })`

必须通过真实可用的轻量方式验证凭据是否基本可用。

输出要求：

- 成功时返回 `ok = true`
- 失败时返回 `ok = false` 或抛出可诊断错误
- 错误信息必须能区分“凭据错误”和“网络/服务不可达”

## 边界要求

- 不负责写配置文件
- 不负责启动 runtime
- 不负责管理 pid / state / log
- 不允许把 CLI prompt 或交互逻辑塞进 `FeishuAdapter` runtime 类
