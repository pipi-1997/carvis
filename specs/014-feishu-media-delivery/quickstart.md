# Quickstart: 飞书会话内资源发送

## 1. 前置准备

1. 准备可运行的本地 runtime 配置、Postgres、Redis、Feishu 凭据和 Codex CLI
2. 确认当前 runtime 已具备普通 Feishu 聊天、CardKit 呈现和 session continuation 能力
3. 让目标 Feishu `chat` 先通过 `/bind <workspace-key>` 绑定到目标 workspace
4. 准备一个测试用本地文件、一个截图文件，以及一个可访问的远端图片或文件 URL

## 2. 启动 runtime

1. 启动 gateway：
   - `bun run dev:gateway`
2. 启动 executor：
   - `bun run dev:executor`
3. 预期结果：
   - `gateway /healthz` 返回 ready
   - executor 输出 ready 状态
   - 当前 chat 用 `/status` 能确认已绑定 workspace

## 3. 验证主路径：把截图直接发回当前会话

1. 在已绑定 workspace 的聊天里发送类似请求：
   - `把刚才生成的截图直接发给我`
2. 预期结果：
   - agent 直接触发受支持的媒体发送路径
   - agent 只进行一次正常发送尝试
   - 中途不需要用户补充 `runId`、`sessionId`、`chatId` 或 `workspace`
   - agent 不需要自行排查 PATH、worktree、`bun` 或本地源码目录
   - 当前 Feishu `chat` 收到图片本体
   - `RunEvent` 中可看到对应的 `agent.tool_call` / `agent.tool_result`
   - operator 查询可看到一条成功的 media delivery audit 和成功的 `OutboundDelivery`

## 4. 验证直接发送本地文件

1. 在同一聊天里发送类似请求：
   - `请把 workspace 里的 README.md 作为文件直接发给我`
2. 预期结果：
   - agent 在正常路径里只提供资源业务参数
   - 当前 Feishu `chat` 收到文件本体，而不是仅收到链接或文字说明

## 5. 验证直接发送远端图片或文件

1. 在同一聊天里发送类似请求：
   - `把这个图片地址直接发出来，不要只贴链接：<remote-url>`
2. 预期结果：
   - 当前 Feishu `chat` 收到图片本体或文件本体
   - media delivery audit 记录 `sourceType = remote_url`
   - 发送结果为 `sent`

## 6. 验证同一 run 内多次发送

1. 发送类似请求：
   - `先发一张图片，再发一个文件`
2. 预期结果：
   - 同一 run 内产生多次媒体发送
   - 多次发送都回到同一个当前 `chat`
   - 不新增旁路 run，不影响既有 queue / lock 语义

## 7. 验证缺少上下文时拒绝

1. 在无活动 run 或无有效 session 上下文的调试路径调用媒体 transport
2. 预期结果：
   - 返回 `invalid_context` 或等价结构化拒绝结果
   - 不产生成功的 `OutboundDelivery`
   - 留下失败的 media delivery audit 或等价 operator-visible 记录

## 8. 验证 transport wiring 缺陷

1. 人工制造 transport 不可执行、PATH 不可见或上下文变量缺失的场景
2. 预期结果：
   - 系统快速返回明确失败，而不是无限等待
   - agent 或 operator 能把问题识别为“发送路径当前不可用”，而不是 source / Feishu 侧故障
   - agent 在首次失败后直接停止，不继续搜索源码目录、切换 worktree 或包装 `bun`

## 9. 验证本地路径失败

1. 让 agent 发送一个不存在的本地路径
2. 预期结果：
   - 工具结果返回 `source_not_found` 或 `source_unreadable`
   - 当前 chat 不会误收到其他资源
   - operator 可以看出失败阶段在 source

## 10. 验证远端 URL 获取失败

1. 让 agent 发送一个不可访问的远端 URL
2. 预期结果：
   - 工具结果返回 `fetch_failed`
   - media delivery audit 停在 source 失败阶段
   - 不产生成功的 `OutboundDelivery`

## 11. 验证 Feishu 上传或发送失败

1. 使用测试桩让 Feishu 上传失败，再让发送失败
2. 预期结果：
   - 上传失败时返回 `upload_failed`
   - 最终发送失败时返回 `delivery_failed`
   - operator 查询能区分两者

## 12. 验证会话隔离

1. 准备两个不同的 Feishu `chat`
2. 在 `chat A` 中发起 run 并触发资源发送
3. 预期结果：
   - 资源只能出现在 `chat A`
   - 不能通过 transport 参数把资源发往 `chat B`

## 13. 验证回归

1. 跑本功能新增的 unit / contract / integration 用例
2. 跑全量回归：
   - `bun test`
   - `bun run lint`
3. 预期结果：
   - 新增 media send 用例通过
   - 既有 queue、presentation、session continuation 相关用例无回归
