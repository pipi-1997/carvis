# 架构图

本文记录当前已落地的 `001-feishu-codex-mvp`、`002-local-runtime-wiring` 和 `003-feishu-cardkit-results` 实现，而不是远期全量蓝图。当前范围覆盖 `Feishu websocket + Codex CLI + 单 agent 固定 workspace + 本地单机双进程 runtime + 运行中卡片与单消息终态呈现`。

## 1. 运行时拓扑（当前实现）

```mermaid
flowchart TB
    subgraph Channels["渠道"]
        FS["Feishu"]
    end

    subgraph Gateway["apps/gateway"]
        GW_HTTP["Hono HTTP 服务\n/healthz"]
        GW_WS["Feishu websocket ingress"]
        GW_ROUTE["会话与命令路由\n/status /abort / 普通消息"]
        GW_NOTIFY["通知服务"]
        GW_PRESENT["Presentation Orchestrator\n输出窗口 / 卡片 / fallback"]
        GW_REAPER["Heartbeat Reaper"]
    end

    subgraph ChannelPackages["渠道适配器"]
        PKG_FS["packages/channel-feishu\nChannelAdapter"]
    end

    subgraph Core["packages/core"]
        CORE_DOMAIN["领域模型\nSession / Run / RunEvent /\nOutboundDelivery / RunPresentation"]
        CORE_RUNTIME["Queue / Lock /\nCancelSignal / Heartbeat"]
        CORE_STORE["配置 + 持久化仓储"]
    end

    subgraph Infra["基础设施"]
        PG[("Postgres")]
        RD[("Redis")]
    end

    subgraph Executor["apps/executor"]
        EX_BOOT["启动与 readiness"]
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

    FS --> PKG_FS --> GW_WS
    GW_HTTP --> GW_ROUTE
    GW_WS --> GW_ROUTE

    GW_ROUTE --> CORE_DOMAIN
    GW_ROUTE --> CORE_RUNTIME
    GW_ROUTE --> CORE_STORE
    GW_REAPER --> CORE_RUNTIME
    GW_REAPER --> CORE_STORE

    CORE_STORE --> PG
    CORE_RUNTIME --> RD

    RD --> EX_BOOT --> EX_QUEUE
    EX_QUEUE --> EX_LOCK
    EX_LOCK --> EX_CTRL
    EX_CTRL --> BR_CX --> CX

    EX_CTRL --> RD
    EX_CTRL --> PG
    EX_CTRL --> CORE_DOMAIN

    PG --> GW_PRESENT --> GW_NOTIFY
    GW_NOTIFY --> PKG_FS --> FS

    RD -. runtime fingerprint .-> GW_HTTP
    RD -. runtime fingerprint .-> EX_BOOT
```

## 2. 请求与执行流程（当前实现）

```mermaid
sequenceDiagram
    autonumber
    participant U as 用户
    participant C as Feishu
    participant G as apps/gateway
    participant W as Feishu websocket ingress
    participant A as FeishuAdapter / Sender
    participant P as Postgres
    participant R as Redis
    participant E as apps/executor
    participant B as CodexBridge
    participant X as Codex CLI

    U->>C: 发送普通消息 /status /abort
    C->>W: websocket 长连接事件
    W-->>G: InboundEnvelope

    G->>G: 按 chat_id 路由 session
    G->>P: 持久化 Session / Run / RunEvent
    G->>R: Enqueue queued run

    R-->>E: 投递排队任务
    E->>R: 获取工作区锁
    E->>B: startRun(RunRequest)
    B->>X: 拉起目标 CLI 进程
    X-->>B: delta / 摘要 / 完成 / 失败 / 取消
    B-->>E: 规范化 RunEvent

    E->>P: 持久化运行与事件
    E->>R: 写入 heartbeat / cancel / lock 状态
    E->>R: 发布 executor runtime fingerprint
    G->>R: 发布 gateway runtime fingerprint
    G->>G: reaper 检查 heartbeat 过期并标记失败

    E->>A: addReaction()
    E->>A: createCard()
    B-->>E: agent.output.delta
    E->>A: updateCard()
    G->>G: reaper 检查 heartbeat 过期并标记失败
    E->>A: completeCard()
    E->>A: sendFallbackTerminal()
    E->>P: 持久化 RunPresentation / OutboundDelivery
    A-->>C: reaction / interactive / fallback post
    C-->>U: reaction / 运行中卡片 / 完成态摘要卡 / 异常兜底结果
```

## 3. 本地运行时约束

- `gateway` 与 `executor` 现在按双进程运行，统一从 `~/.carvis/config.json` 和环境变量读取运行时配置。
- `packages/channel-feishu` 负责 websocket 握手、allowlist / mention 过滤和 `InboundEnvelope` 归一化；这些细节不泄漏到 queue / run-flow。
- `packages/channel-feishu` 同时负责工作中 reaction、运行中 `interactive` 卡片、完成态摘要卡和异常兜底终态消息的发送。
- `packages/bridge-codex` 同时保留脚本化测试 transport 和真实 `codex exec` CLI transport。
- `packages/bridge-codex` 现在把 `codex exec --json` 的 JSONL 输出解析为有序 `agent.output.delta`，供 `gateway` 输出窗口合并与过程卡片打字机更新使用。
- `packages/core/src/runtime/runtime-factory.ts` 现在负责：
  - 真实 Postgres / Redis 客户端装配
  - migration 触发
  - queue / lock / heartbeat / cancel 协调对象创建
  - runtime fingerprint 发布与漂移检测
- 当检测到 `CONFIG_DRIFT` 时：
  - `gateway /healthz` 返回 `ready = false`
  - `executor` 输出结构化 `CONFIG_DRIFT` 状态并拒绝进入 `consumer_active = true`
- `RunPresentation` 是 003 新增的持久化实体，用于记录：
  - `pending_start`
  - `streaming`
  - `completed / failed / cancelled`
  - `degraded`
  - 以及 `streamingMessageId / streamingCardId / fallbackTerminalMessageId / lastOutputExcerpt`
- 过程卡片创建或更新失败时，系统立即把该次呈现标记为 `degraded`，停止继续更新卡片；只有在卡片从未成功创建时，才会发送异常兜底终态消息。

## 4. 说明

- 当前实现只包含 `packages/channel-feishu` 和 `packages/bridge-codex`，没有引入 Telegram、Claude Code、scheduler 或 admin UI。
- `apps/gateway` 负责健康检查、Feishu websocket 入站、session 路由、命令处理、呈现编排服务和 heartbeat reaper。
- `apps/executor` 负责启动期 readiness、消费队列、获取工作区锁、驱动 Codex bridge、处理取消和维护 heartbeat；并复用 `apps/gateway` 的通知与呈现编排逻辑完成 Feishu 出站。
- 真实本地联调依赖本机可访问的 Postgres、Redis 和已登录的 `codex` CLI。
