# Quickstart: 调度器与外部 Webhook 触发

## 1. 前置准备

1. 准备可运行的本地 runtime 配置、Postgres、Redis、Feishu 凭据和 Codex CLI
2. 在 workspace registry 中声明至少一个可执行 workspace
3. 在 runtime config 中新增 trigger definitions
4. 为 external webhook 准备独立 secret
5. 确认 gateway 可以暴露 HTTP webhook 路径，executor 正常消费队列

示例配置片段：

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
      "ops": "/Users/pipi/.carvis/workspaces/ops"
    },
    "chatBindings": {},
    "managedWorkspaceRoot": "/Users/pipi/.carvis/workspaces",
    "templatePath": "/Users/pipi/.carvis/templates/default-workspace"
  },
  "triggers": {
    "scheduledJobs": [
      {
        "id": "daily-ops-report",
        "enabled": true,
        "workspace": "ops",
        "schedule": "0 9 * * *",
        "promptTemplate": "生成今日 ops 巡检摘要。",
        "delivery": {
          "kind": "feishu_chat",
          "chatId": "oc_ops_group"
        }
      }
    ],
    "webhooks": [
      {
        "id": "build-failed",
        "enabled": true,
        "slug": "build-failed",
        "workspace": "ops",
        "promptTemplate": "分析构建失败事件：{{event_type}} / {{summary}}",
        "requiredFields": ["event_type", "summary"],
        "secretEnv": "CARVIS_WEBHOOK_BUILD_FAILED_SECRET",
        "delivery": {
          "kind": "feishu_chat",
          "chatId": "oc_ops_group"
        }
      }
    ]
  }
}
```

## 2. 启动 runtime

1. 启动 gateway：
   - `bun run dev:gateway`
2. 启动 executor：
   - `bun run dev:executor`
3. 预期结果：
   - `gateway /healthz` 返回 ready
   - executor 输出 ready 状态
   - trigger definitions 被同步到 Postgres
   - 内部管理查询面可以返回 definition 的 `enabled`、`last_triggered`、`next_due` 等基础状态

## 3. 验证 scheduled job

1. 将测试 job 的计划时间设置到接近当前时间
2. 等待 scheduler tick 扫描 due jobs
3. 预期结果：
   - 产生一条 `TriggerExecution`
   - 生成 `Run(triggerSource = scheduled_job)`
   - 若 workspace 空闲，则进入 running
   - 若 workspace 忙，则进入 queued
   - 从 due 到 `queued` 或 `running` 的延迟满足实现设定的 60 秒预算
   - 内部管理查询面能看到 definition 的 `last_triggered` 已更新，execution 与 run 已关联

## 4. 验证 missed / skipped 行为

1. 禁用某条 scheduled job 或让 gateway 在计划窗口停机
2. 恢复 gateway 后观察 trigger 状态
3. 预期结果：
   - disabled definition 被记录为 `skipped`
   - 停机期间错过的窗口被记录为 `missed`
   - 不自动补跑历史窗口

## 5. 验证 external webhook accepted

1. 准备 webhook body：

```json
{
  "event_type": "build_failed",
  "summary": "main branch CI failed"
}
```

2. 使用 definition secret 对原始 body 生成签名与时间戳
3. 发送 `POST` 到 external webhook 入口
4. 预期结果：
   - HTTP 同步返回 accepted
   - accepted 响应在 2 秒预算内返回
   - 产生一条 `TriggerExecution`
   - 生成 `Run(triggerSource = external_webhook)`
   - 终态摘要按 definition 配置投递到目标 Feishu chat

## 6. 验证 external webhook rejected

1. 分别发送未知 slug、错误签名、过期时间戳和缺失必填字段的请求
2. 预期结果：
   - 所有请求都同步返回 rejected
   - 不创建 `Run`
   - operator 可看到 rejection reason

## 7. 验证内部管理查询面

1. 调用 gateway 的内部 trigger 查询接口，分别按 definition 和 execution 读取状态
2. 预期结果：
   - definition 视图包含 `enabled`、`last_triggered`、`next_due`、最近 `missed/skipped`
   - execution 视图包含 `accepted/rejected/queued/running/completed/failed/cancelled/heartbeat_expired/delivery_failed`
   - execution 结果可反查关联 `Run` 与 outbound delivery 记录
   - 所有结果都来自 Postgres 持久化状态，而不是进程内存

## 8. 验证 queue / lock 一致性

1. 先让某个 chat-triggered run 在 `ops` workspace 长时间运行
2. 在运行期间触发 `daily-ops-report` scheduled job 或 `build-failed` webhook
3. 预期结果：
   - 新 trigger run 进入同一 workspace 的 FIFO 队列
   - 不抢占已有 active run
   - active run 完成后再启动 trigger run

## 9. 验证 non-chat run 不复用 continuation

1. 让某个飞书 `chat` 先建立 continuation binding
2. 再触发一个 scheduled job 或 external webhook，命中相同 workspace
3. 预期结果：
   - 该 trigger run 以 `fresh` 模式执行
   - 不读取、不写回任何 chat continuation binding

## 10. 验证 heartbeat expiry 与 delivery failure
1. 故意制造一个 non-chat trigger run 的 heartbeat 丢失或超时场景
2. 再故意让另一个已配置 delivery target 的 scheduled job 或 webhook 在终态投递时失败
3. 预期结果：
   - heartbeat 失效的那次 execution 被记录为 `failed` + `heartbeat_expired` 或等价终态原因
   - delivery 失败的那次 `Run` 仍保留 `completed` / `failed` / `cancelled` 的真实终态
   - `TriggerExecution` 或内部管理查询面单独显示 `delivery_failed`
   - operator 能明确区分“执行失败”与“通知失败”两类问题
