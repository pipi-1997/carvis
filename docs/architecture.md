# 架构图

本文记录当前已落地的 `001-feishu-codex-mvp` 实现，而不是远期全量蓝图。当前范围只覆盖 `Feishu + Codex + 单 agent 固定 workspace`。

## 1. 运行时拓扑（当前实现）

```mermaid
flowchart TB
    subgraph Channels["渠道"]
        FS["Feishu"]
    end

    subgraph Gateway["apps/gateway"]
        GW_WEB["Webhook 处理器"]
        GW_ROUTE["会话与命令路由\n/status /abort / 普通消息"]
        GW_NOTIFY["通知服务"]
        GW_REAPER["Heartbeat Reaper"]
    end

    subgraph ChannelPackages["渠道适配器"]
        PKG_FS["packages/channel-feishu\nChannelAdapter"]
    end

    subgraph Core["packages/core"]
        CORE_DOMAIN["领域模型\nSession / Run / RunEvent /\nOutboundDelivery"]
        CORE_RUNTIME["Queue / Lock /\nCancelSignal / Heartbeat"]
        CORE_STORE["配置 + 持久化仓储"]
    end

    subgraph Infra["基础设施"]
        PG[("Postgres")]
        RD[("Redis")]
    end

    subgraph Executor["apps/executor"]
        EX_QUEUE["运行任务消费者"]
        EX_LOCK["工作区锁管理器"]
        EX_CTRL["运行控制器\ncancel / timeout / heartbeat"]
    end

    subgraph Bridges["智能体桥接器"]
        BR_CX["packages/bridge-codex\nAgentBridge"]
    end

    subgraph Agents["智能体 CLI"]
        CX["Codex CLI"]
    end

    FS --> PKG_FS --> GW_WEB

    GW_WEB --> GW_ROUTE
    GW_ROUTE --> CORE_DOMAIN
    GW_ROUTE --> CORE_RUNTIME
    GW_ROUTE --> CORE_STORE
    GW_REAPER --> CORE_RUNTIME
    GW_REAPER --> CORE_STORE

    CORE_STORE --> PG
    CORE_RUNTIME --> RD

    RD --> EX_QUEUE
    EX_QUEUE --> EX_LOCK
    EX_LOCK --> EX_CTRL
    EX_CTRL --> BR_CX --> CX

    EX_CTRL --> RD
    EX_CTRL --> PG
    EX_CTRL --> CORE_DOMAIN

    PG --> GW_NOTIFY
    GW_NOTIFY --> PKG_FS --> FS
```

## 2. 请求与执行流程（当前实现）

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant C as Feishu
    participant G as apps/gateway
    participant A as FeishuAdapter
    participant P as Postgres
    participant R as Redis
    participant E as apps/executor
    participant B as CodexBridge
    participant X as Codex CLI

    U->>C: 发送普通消息 /status /abort
    C->>G: Webhook 请求
    G->>A: verifyWebhook(request)
    G->>A: parseInbound(request)
    A-->>G: InboundEnvelope

    G->>G: 按 chat_id 路由 session
    G->>P: 持久化 Session / Run / RunEvent
    G->>R: Enqueue queued run

    R-->>E: 投递排队任务
    E->>R: 获取工作区锁
    E->>B: startRun(RunRequest)
    B->>X: 拉起目标 CLI 进程
    X-->>B: 摘要 / 完成 / 失败 / 取消
    B-->>E: 规范化 RunEvent

    E->>P: 持久化运行与事件
    E->>R: 写入 heartbeat / cancel / lock 状态
    G->>G: reaper 检查 heartbeat 过期并标记失败

    G->>G: 组装状态、摘要与最终结果通知
    G->>A: sendMessage() / editMessage()
    A-->>C: OutboundMessage
    C-->>U: 状态 / 结果 / 错误更新
```

## 说明

- 当前实现只包含 `packages/channel-feishu` 和 `packages/bridge-codex`，没有引入 Telegram、Claude Code、scheduler 或 admin UI。
- `apps/gateway` 负责验签、allowlist、session 路由、命令处理、出站通知和 heartbeat reaper。
- `apps/executor` 负责消费队列、获取工作区锁、驱动 Codex bridge、处理取消和维护 heartbeat。
