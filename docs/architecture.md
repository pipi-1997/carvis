# 架构图

本文把 `plan.md` 中的系统设计转换为 Mermaid 图，便于后续用中文讨论架构与实现边界。

## 1. 运行时拓扑

```mermaid
flowchart TB
    subgraph Channels["渠道与触发源"]
        TG["Telegram"]
        FS["Feishu"]
        SCH["调度器"]
        EWH["外部 Webhook"]
    end

    subgraph Gateway["apps/gateway"]
        GW_WEB["Webhook 处理器"]
        GW_ADMIN["管理界面 / 管理 API"]
        GW_ROUTE["会话与命令路由"]
        GW_NOTIFY["通知管线"]
    end

    subgraph ChannelPackages["渠道适配器"]
        PKG_TG["packages/channel-telegram\nChannelAdapter"]
        PKG_FS["packages/channel-feishu\nChannelAdapter"]
    end

    subgraph Core["packages/core"]
        CORE_DOMAIN["领域模型\nInboundEnvelope / RunRequest /\nRunEvent / OutboundMessage"]
        CORE_QUEUE["队列契约"]
        CORE_STORE["存储模型 + 配置 + 可观测性"]
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
        BR_CC["packages/bridge-claude-code\nAgentBridge"]
        BR_CX["packages/bridge-codex\nAgentBridge"]
    end

    subgraph Agents["智能体 CLI"]
        CC["Claude Code CLI"]
        CX["Codex CLI"]
    end

    TG --> PKG_TG --> GW_WEB
    FS --> PKG_FS --> GW_WEB
    SCH --> GW_ROUTE
    EWH --> GW_ROUTE

    GW_WEB --> GW_ROUTE
    GW_ADMIN --> GW_ROUTE
    GW_ROUTE --> CORE_DOMAIN
    GW_ROUTE --> CORE_QUEUE
    GW_ROUTE --> CORE_STORE
    GW_ROUTE --> PG
    GW_ROUTE --> RD

    RD --> EX_QUEUE
    EX_QUEUE --> EX_LOCK
    EX_LOCK --> EX_CTRL
    EX_CTRL --> BR_CC --> CC
    EX_CTRL --> BR_CX --> CX

    EX_CTRL --> RD
    EX_CTRL --> PG
    EX_CTRL --> CORE_DOMAIN

    RD --> GW_NOTIFY
    PG --> GW_NOTIFY
    GW_NOTIFY --> PKG_TG --> TG
    GW_NOTIFY --> PKG_FS --> FS
    GW_ADMIN --> PG
    GW_ADMIN --> RD
```

## 2. 请求与执行流程

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户 / 触发方
    participant C as 渠道或触发源
    participant G as apps/gateway
    participant A as ChannelAdapter
    participant P as Postgres
    participant R as Redis
    participant E as apps/executor
    participant B as AgentBridge
    participant X as Agent CLI

    U->>C: 发送消息 / 触发事件
    C->>G: Webhook 请求
    G->>A: verifyWebhook(request)
    G->>A: parseInbound(request)
    A-->>G: InboundEnvelope

    G->>G: 按 channel + thread 进行会话路由
    G->>G: 命令路由（/new /status /abort /workspace /agent /help）
    G->>P: 持久化会话与运行元数据
    G->>R: Enqueue RunRequest

    R-->>E: 投递排队任务
    E->>R: 获取工作区锁
    E->>B: startRun(RunRequest)
    B->>X: 拉起目标 CLI 进程
    X-->>B: 流式输出原始结果
    B-->>E: 规范化 RunEvents

    E->>P: 持久化运行与事件
    E->>R: 发布实时事件 / 心跳 / 取消状态
    R-->>G: 扇出运行事件

    G->>G: 组装出站通知
    G->>A: sendMessage() / editMessage()
    A-->>C: OutboundMessage
    C-->>U: 状态 / 结果 / 错误更新
```

## 说明

- 图中反映的是 `plan.md` 的 v1 范围：两个渠道、两个智能体桥接器、每个工作区仅一个活动运行，以及基于 Redis 的排队与加锁。
- `apps/gateway` 负责入站归一化、会话路由、持久化、通知、调度器、外部 webhook 入口和管理能力。
- `apps/executor` 负责作业消费、工作区串行化、CLI 执行、生命周期控制和事件发布。
