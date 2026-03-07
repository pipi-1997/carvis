# Bun Multi-Channel Agent Gateway Plan

## Summary

Build a Bun-based multi-channel agent gateway from scratch, using `claude-code-telegram`
as the reference skeleton but replacing its single-channel and single-agent assumptions
with two explicit abstractions:

- `ChannelAdapter`: supports Feishu and Telegram
- `AgentBridge`: supports Claude Code and Codex

The v1 target is a self-hosted internal tool with separated `gateway` and `executor`
processes, `Postgres + Redis`, host-local workspaces with locks, built-in webhook /
scheduler / notification flows, and a simple web admin surface.

## Architecture

### Runtime topology

- `apps/gateway`
  - Receives Telegram and Feishu webhooks
  - Hosts admin UI and internal admin APIs
  - Runs scheduler and external webhook triggers
  - Persists sessions, runs, deliveries, and audit logs
  - Dispatches work to executors and pushes outbound notifications
- `apps/executor`
  - Consumes queued run requests
  - Acquires workspace locks
  - Spawns agent CLI processes
  - Streams run events back to the gateway event pipeline
  - Handles cancel, timeout, and heartbeat
- `packages/core`
  - Shared domain types, queue contracts, config, storage models, and observability
- `packages/channel-telegram`
  - Telegram-specific webhook verification and outbound message delivery
- `packages/channel-feishu`
  - Feishu-specific webhook verification and outbound message delivery
- `packages/bridge-claude-code`
  - Claude Code CLI driver
- `packages/bridge-codex`
  - Codex CLI driver

### Core interfaces

#### ChannelAdapter

Each channel package implements one shared adapter interface:

```ts
interface ChannelAdapter {
  verifyWebhook(request: Request): Promise<void>;
  parseInbound(request: Request): Promise<InboundEnvelope>;
  sendMessage(message: OutboundMessage): Promise<DeliveryResult>;
  editMessage(message: OutboundMessage): Promise<DeliveryResult>;
  normalizeIdentity(input: unknown): ChannelIdentity;
}
```

#### AgentBridge

Each agent package implements one shared bridge interface:

```ts
interface AgentBridge {
  startRun(request: RunRequest): Promise<RunHandle>;
  resumeRun(runId: string): Promise<void>;
  cancelRun(runId: string): Promise<void>;
  streamEvents(runId: string): AsyncIterable<RunEvent>;
  healthcheck(): Promise<BridgeHealth>;
}
```

### Canonical domain model

- `InboundEnvelope`
  - normalized channel message, user, thread, attachments, command, trigger source
- `RunRequest`
  - workspace, session, agent, prompt, timeout, environment, metadata
- `RunEvent`
  - `run.started`
  - `agent.output.delta`
  - `tool.started`
  - `tool.finished`
  - `run.completed`
  - `run.failed`
  - `run.cancelled`
- `OutboundMessage`
  - target channel, target thread, text or rich content, related `run_id`
- `WorkspaceBinding`
  - session-to-workspace binding and default agent selection

## Request and execution flow

1. Telegram or Feishu webhook hits `apps/gateway`.
2. The matching `ChannelAdapter` verifies the request and produces an `InboundEnvelope`.
3. Gateway session routing resolves or creates a session by `channel + thread`.
4. Command routing handles `/new`, `/status`, `/abort`, `/workspace`, `/agent`, `/help`.
5. Normal chat input becomes a `RunRequest`, which is written to Postgres and queued in Redis.
6. `apps/executor` consumes the job, acquires the workspace lock, and selects the target `AgentBridge`.
7. The bridge spawns the matching CLI process and maps output into canonical `RunEvent`s.
8. Events are persisted and published through Redis to the gateway notification pipeline.
9. Gateway converts canonical events into Telegram or Feishu outbound messages.

## v1 behavior defaults

- Session scope is `channel thread -> workspace -> agent session`
- Cross-channel conversation sharing is out of scope
- One workspace can have only one active run at a time
- Additional requests for the same workspace enter a FIFO queue
- `/abort` cancels only the active run and preserves queued jobs
- Scheduler and external webhook triggers enter the same event pipeline as chat messages
- Agent execution is CLI-first; SDK support is an interface extension for later
- Webhooks are the only inbound channel mode; no polling in v1

## Storage and infrastructure

### Postgres

Persist the following business entities:

- `users`
- `channel_accounts`
- `workspaces`
- `sessions`
- `agent_runs`
- `run_events`
- `scheduled_jobs`
- `outbound_deliveries`
- `audit_logs`

### Redis

Use Redis for:

- run dispatch queue
- workspace distributed locks
- run cancellation signals
- live event fan-out
- executor heartbeat

### Failure handling

- Agent failures do not auto-replay prompts
- Outbound delivery retries up to three times with backoff
- Executor heartbeat expiry marks active runs as failed
- Failed runs remain visible in admin UI and audit logs

## Admin surface

Expose a minimal internal web admin inside `apps/gateway`:

- channel configuration and enable/disable
- workspace configuration
- default agent per session or workspace
- allowlist user management
- run list, status, and error inspection
- scheduler and external webhook configuration

The admin surface does not include multi-tenant isolation, billing, or fine-grained RBAC.

## Commands

The v1 command set is fixed:

- `/new`
- `/status`
- `/abort`
- `/workspace`
- `/agent`
- `/help`

## Testing

### Unit tests

- Telegram and Feishu inbound normalization
- Claude Code and Codex bridge event mapping
- workspace lock, queueing, timeout, and cancel logic
- session and command routing

### Contract tests

- `InboundEnvelope -> RunRequest -> RunEvent -> OutboundMessage`
- fake channel adapters against the shared adapter contract
- fake bridges against the shared bridge contract

### Integration tests

- Telegram message starts a Claude Code run
- Feishu message starts a Codex run
- concurrent requests for one workspace queue correctly
- `/abort` cancels the active run
- scheduler trigger enters the same execution path
- external webhook trigger enters the same execution path
- executor crash or heartbeat loss marks the run as failed

## Assumptions

- This repository is greenfield and does not need migration compatibility
- The system is an internal self-hosted team tool
- Bun is the runtime for both gateway and executor
- The HTTP layer can use a Bun-friendly lightweight framework such as Hono
- v1 does not implement SDK-based execution, container sandboxes, or multi-tenant features
