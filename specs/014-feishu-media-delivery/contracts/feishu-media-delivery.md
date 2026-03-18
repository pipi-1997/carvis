# 合同：Feishu Media Delivery

## 1. 适用范围

- 该合同定义 `packages/channel-feishu` 在媒体发送场景下的职责边界
- 目标资源类型至少包括图片和通用文件

## 2. 渠道职责

- Feishu 渠道层必须负责：
  - 使用租户 token 完成媒体上传
  - 发送最终图片或文件消息
  - 返回最终消息引用或资源引用
- 网关和执行器不得直接实现 Feishu 专属上传协议

## 3. 成功语义

- 图片发送成功时，当前 chat 必须直接看到图片本体
- 文件发送成功时，当前 chat 必须直接看到文件本体
- 成功结果必须能回传消息引用或资源引用，供 durable audit 记录

## 4. 失败语义

- 上传失败必须与最终发送失败区分
- access token 失效时，可沿用既有 token 刷新并重试一次语义
- 渠道不支持的资源类型必须返回明确错误
- 上层必须能够把 Feishu 渠道失败与 transport wiring / source failure 区分开来

## 5. 与现有文本/卡片发送的关系

- 文本消息、互动卡片和 fallback terminal 语义保持不变
- 媒体发送是新增能力，不得破坏既有 `sendMessage` / `createCard` / `updateCard` / `completeCard` 路径

## 6. 可观测性

- Feishu 渠道层必须暴露足够的错误信息，供上层区分：
  - source 已准备但上传失败
  - 上传成功但发送失败
  - token 刷新后仍失败
