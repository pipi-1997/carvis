# Quickstart: 飞书会话工作区绑定

## 1. 前置准备

1. 在运行时配置中声明：
   - `agent.defaultWorkspace`
   - workspace registry
   - managed workspace root
   - 默认初始化 template
2. 准备至少一个 registry workspace 供绑定验证
3. 确认 `defaultWorkspace` 指向 `managedWorkspaceRoot` 下的托管目录，而不是直接指向业务仓库根目录
4. 确认 template 目录可读，且允许在 managed workspace root 下创建目录
5. 确认 template 至少包含 `README.md`、`.gitignore` 和 workspace 约定文件

示例配置：

```json
{
  "agent": {
    "id": "codex-main",
    "bridge": "codex",
    "defaultWorkspace": "main",
    "timeoutSeconds": 1800,
    "maxConcurrent": 1
  },
  "workspaceResolver": {
    "registry": {
      "main": "/Users/pipi/.carvis/workspaces/main",
      "ops": "/Users/pipi/workspace/ops"
    },
    "chatBindings": {
      "oc_ops_group": "ops"
    },
    "managedWorkspaceRoot": "/Users/pipi/.carvis/workspaces",
    "templatePath": "/Users/pipi/.carvis/templates/default-workspace"
  }
}
```

## 2. 私聊默认工作区验证

1. 向机器人发起一个新的飞书私聊
2. 发送一条普通消息
3. 预期结果：
   - 创建新的 `Session`
   - 自动解析到 `managedWorkspaceRoot` 下的 `defaultWorkspace`
   - 创建 run 并进入正常执行链路
   - `/status` 显示 workspace 来源为 `default`

## 3. 群聊未绑定拒绝验证

1. 在一个未配置映射、未执行 `/bind` 的群聊中发送普通消息
2. 预期结果：
   - 不创建 run
   - 不进入 queue
   - 返回“当前群聊未绑定 workspace”的引导提示
   - `/status` 显示 workspace 来源为 `unbound`

## 4. 群聊静态映射验证

1. 为目标 `chat_id` 配置静态 workspace 映射
2. 在该群聊中发送普通消息
3. 预期结果：
   - 创建新的 `Session`
   - 创建或刷新 `SessionWorkspaceBinding(bindingSource = config)`
   - run 命中映射 workspace

## 5. `/bind` 绑定已有 workspace 验证

1. 在群聊中执行 `/bind ops`
2. 预期结果：
   - 当前 session 绑定到 `ops`
   - `/status` 显示来源为 `manual`
   - 后续普通消息命中 `ops`

## 6. `/bind` 创建新 workspace 验证

1. 在群聊中执行 `/bind feature-a`
2. 预期结果：
   - 若 `feature-a` 不存在，则按默认 template 初始化新 workspace
   - 新目录至少包含 `README.md`、`.gitignore` 和 workspace 约定文件
   - 创建新的 workspace catalog 记录
   - 当前 session 绑定来源为 `created`
   - 后续普通消息命中 `feature-a`

## 7. 活动运行保护验证

1. 在已绑定 workspace 的 session 中发起一个长时间运行
2. 运行期间执行 `/bind another-workspace`
3. 预期结果：
   - `/bind` 被拒绝
   - 当前 run 继续在原 workspace 执行
   - `/status` 不出现 workspace 分裂状态

## 8. `/new` 与 workspace 解耦验证

1. 在已绑定 workspace 且已有 continuation 的 session 中执行 `/new`
2. 再执行 `/status`
3. 预期结果：
   - continuation 状态重置
   - workspace key 和 bindingSource 保持不变

## 9. 托管根目录权限拒绝验证

1. 令 `managedWorkspaceRoot` 指向一个不可写目录，或被非目录文件占用的路径
2. 在群聊执行 `/bind feature-permission`
3. 预期结果：
   - `/bind` 返回清晰的 `workspace create failed` 错误
   - 不创建新的 workspace catalog 记录
   - 原有 session workspace binding 保持不变

## 10. heartbeat 失效后的绑定可见性验证

1. 在已绑定 workspace 的 session 中发起一个长时间运行
2. 让执行器 heartbeat 过期并触发 reap
3. 再执行 `/status`
4. 预期结果：
   - 该 run 标记为 `failed/heartbeat_expired`
   - 当前 session 的 `workspace key` 与 `workspace 来源` 仍可见
   - `/status` 不回退为 `unbound`
