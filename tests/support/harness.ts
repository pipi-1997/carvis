import { createHash } from "node:crypto";

import { createExecutorWorker } from "../../apps/executor/src/worker.ts";
import { createGatewayApp } from "../../apps/gateway/src/app.ts";
import { createAllowlistGuard } from "../../apps/gateway/src/security/allowlist.ts";
import { createRunNotifier } from "../../apps/gateway/src/services/run-notifier.ts";
import { createRunReaper } from "../../apps/gateway/src/services/run-reaper.ts";
import { CodexBridge, createScriptedCodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { FeishuAdapter } from "../../packages/channel-feishu/src/adapter.ts";
import type { AgentConfig, RunStatus } from "../../packages/core/src/domain/models.ts";
import { createInMemoryRepositories } from "../../packages/core/src/storage/repositories.ts";
import { CancelSignalStore } from "../../packages/core/src/runtime/cancel-signal.ts";
import { HeartbeatMonitor } from "../../packages/core/src/runtime/heartbeat.ts";
import { RunQueue } from "../../packages/core/src/runtime/queue.ts";
import { WorkspaceLockManager } from "../../packages/core/src/runtime/workspace-lock.ts";

export const TEST_AGENT_CONFIG: AgentConfig = {
  id: "codex-main",
  bridge: "codex",
  workspace: "/tmp/carvis-workspace",
  timeoutSeconds: 60,
  maxConcurrent: 1,
};

export function createSignedHeaders(
  body: string,
  secret = "test-secret",
  timestamp = "1700000000",
) {
  const signature = createHash("sha256")
    .update(`${timestamp}:${secret}:${body}`)
    .digest("hex");

  return {
    "content-type": "application/json",
    "x-feishu-request-timestamp": timestamp,
    "x-feishu-signature": signature,
  };
}

export function createFeishuPayload(text: string, overrides?: Partial<Record<string, string>>) {
  const chatId = overrides?.chat_id ?? "chat-001";
  const messageId = overrides?.message_id ?? "msg-001";
  const userId = overrides?.user_id ?? "user-001";

  return {
    header: {
      event_type: "im.message.receive_v1",
    },
    event: {
      sender: {
        sender_id: {
          open_id: userId,
        },
      },
      message: {
        message_id: messageId,
        chat_id: chatId,
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({
          text,
        }),
      },
    },
  };
}

export function createHarness(options?: {
  transportScript?: Parameters<typeof createScriptedCodexTransport>[0];
  heartbeatTtlMs?: number;
  allowChatIds?: string[];
}) {
  let currentTime = Date.parse("2026-03-08T00:00:00.000Z");
  const now = () => new Date(currentTime);
  const repositories = createInMemoryRepositories();
  const queue = new RunQueue();
  const workspaceLocks = new WorkspaceLockManager();
  const cancelSignals = new CancelSignalStore();
  const heartbeats = new HeartbeatMonitor({
    ttlMs: options?.heartbeatTtlMs ?? 1_000,
  });
  const adapter = new FeishuAdapter({
    signingSecret: "test-secret",
    sender: {
      sendMessage: async () => ({
        messageId: `delivery-${Math.random().toString(36).slice(2, 10)}`,
      }),
    },
  });
  const notifier = createRunNotifier({
    adapter,
    repositories,
  });
  const bridge = new CodexBridge({
    transport: createScriptedCodexTransport(
      options?.transportScript ?? [
        { type: "summary", summary: "正在分析仓库", sequence: 1 },
        { type: "result", resultSummary: "仓库目标已总结" },
      ],
    ),
    now,
  });
  const gateway = createGatewayApp({
    agentConfig: TEST_AGENT_CONFIG,
    adapter,
    repositories,
    queue,
    cancelSignals,
    allowlist: createAllowlistGuard({
      allowedChatIds: options?.allowChatIds,
    }),
    notifier,
    now,
  });
  const executor = createExecutorWorker({
    agentConfig: TEST_AGENT_CONFIG,
    repositories,
    queue,
    workspaceLocks,
    cancelSignals,
    heartbeats,
    bridge,
    notifier,
    now,
  });
  const reaper = createRunReaper({
    repositories,
    heartbeats,
    queue,
    workspaceLocks,
    notifier,
    cancelSignals,
    now,
  });

  async function postFeishuText(text: string, overrides?: Partial<Record<string, string>>) {
    const payload = createFeishuPayload(text, overrides);
    const body = JSON.stringify(payload);

    return gateway.request("http://localhost/webhooks/feishu", {
      method: "POST",
      headers: createSignedHeaders(body),
      body,
    });
  }

  async function listRunStatuses(): Promise<RunStatus[]> {
    const runs = await repositories.runs.listRuns();
    return runs.map((run) => run.status);
  }

  async function waitForRunStatus(status: RunStatus, attempts = 20): Promise<void> {
    for (let index = 0; index < attempts; index += 1) {
      const statuses = await listRunStatuses();
      if (statuses.includes(status)) {
        return;
      }
      await Promise.resolve();
    }

    throw new Error(`run status ${status} not reached`);
  }

  async function waitForHeartbeat(runId: string, attempts = 20): Promise<void> {
    for (let index = 0; index < attempts; index += 1) {
      if (heartbeats.hasRun(runId)) {
        return;
      }
      await Promise.resolve();
    }

    throw new Error(`heartbeat not registered for ${runId}`);
  }

  return {
    advanceTime(ms: number) {
      currentTime += ms;
    },
    adapter,
    bridge,
    cancelSignals,
    executor,
    gateway,
    heartbeats,
    notifier,
    postFeishuText,
    queue,
    reaper,
    repositories,
    workspaceLocks,
    listRunStatuses,
    waitForHeartbeat,
    waitForRunStatus,
  };
}
