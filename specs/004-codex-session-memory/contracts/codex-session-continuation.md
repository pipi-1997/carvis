# 合同：Codex 会话续聊

## 1. `RunRequest` 到 `AgentBridge` 的输入契约

### 必填输入

- `runId`
- `sessionId`
- `workspace`
- `prompt`
- `timeoutSeconds`

### 可选输入

- `bridgeSessionId`
- `sessionMode`

### 行为要求

- 当 `bridgeSessionId` 为空时，`bridge-codex` 必须以新会话模式执行
- 当 `bridgeSessionId` 非空时，`bridge-codex` 必须尝试继续该底层会话
- `bridge-codex` 不得要求 Feishu 层理解底层续聊协议或命令细节

## 2. 桥接层结果契约

### 成功结果

- 成功完成的运行必须返回：
  - `resultSummary`
  - `bridgeSessionId`（若本轮可继续复用）
  - `sessionOutcome`，用于区分“新建会话”还是“继续会话”

### 失效识别

- 当底层 Codex 明确表明请求引用的会话不可恢复时，桥接层必须返回一致的“session invalid”信号
- 该信号必须可被 `executor` 明确区分为“续聊失效”而不是普通执行失败

### 非目标行为

- 普通命令失败、工作区失败或其他 bridge 错误，不得被桥接层伪装成“续聊失效”

## 3. 自动恢复契约

### 触发条件

- 仅当 `executor` 收到桥接层明确的“续聊失效”结果时，系统才允许触发自动恢复

### 恢复行为

- 系统必须先清除旧的 `bridgeSessionId`
- 系统只允许以新会话模式自动重试一次
- 自动重试成功后，新的 `bridgeSessionId` 必须被回写到当前会话绑定

### 恢复失败

- 自动重试失败后，run 必须按普通失败结束
- 不得进行第二次自动恢复
- 失败结果必须保留“本轮已经尝试过自动恢复”的可审计标记
- 若本轮最终交付失败但运行本身已成功，持久化状态必须仍能区分“run completed”与“delivery failed”
