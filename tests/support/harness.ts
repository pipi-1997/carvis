import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

import { createExecutorWorker } from "../../apps/executor/src/worker.ts";
import { createGatewayApp } from "../../apps/gateway/src/app.ts";
import { createAllowlistGuard } from "../../apps/gateway/src/security/allowlist.ts";
import { createPresentationOrchestrator } from "../../apps/gateway/src/services/presentation-orchestrator.ts";
import { createRunNotifier } from "../../apps/gateway/src/services/run-notifier.ts";
import { createRunReaper } from "../../apps/gateway/src/services/run-reaper.ts";
import { createSchedulerLoop } from "../../apps/gateway/src/services/scheduler-loop.ts";
import { createTriggerDefinitionSync } from "../../apps/gateway/src/services/trigger-definition-sync.ts";
import { signExternalWebhookBody } from "../../apps/gateway/src/services/external-webhook-auth.ts";
import { createTriggerDispatcher } from "../../apps/gateway/src/services/trigger-dispatcher.ts";
import { createTriggerStatusPresenter } from "../../apps/gateway/src/services/trigger-status-presenter.ts";
import { CodexBridge, createScriptedCodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import type { CodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { FeishuAdapter } from "../../packages/channel-feishu/src/adapter.ts";
import type { AgentConfig, OutboundMessage, RunRequest, RunStatus } from "../../packages/core/src/domain/models.ts";
import type { RuntimeConfig } from "../../packages/core/src/domain/runtime-models.ts";
import { createRuntimeLogger } from "../../packages/core/src/observability/runtime-logger.ts";
import { createInMemoryRepositories } from "../../packages/core/src/storage/repositories.ts";
import { CancelSignalStore } from "../../packages/core/src/runtime/cancel-signal.ts";
import { HeartbeatMonitor } from "../../packages/core/src/runtime/heartbeat.ts";
import { RunQueue } from "../../packages/core/src/runtime/queue.ts";
import { WorkspaceLockManager } from "../../packages/core/src/runtime/workspace-lock.ts";

export const TEST_AGENT_CONFIG: AgentConfig = {
  id: "codex-main",
  bridge: "codex",
  defaultWorkspace: "main",
  workspace: "/tmp/carvis-managed-workspaces/main",
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

type FeishuPayloadOverrides = {
  chat_id?: string;
  chat_type?: string;
  message_id?: string;
  user_id?: string;
  mentions?: Array<{
    name?: string;
  }>;
};

export function createFeishuPayload(text: string, overrides?: FeishuPayloadOverrides) {
  const chatId = overrides?.chat_id ?? "chat-001";
  const chatType = overrides?.chat_type ?? "p2p";
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
        chat_type: chatType,
        message_type: "text",
        content: JSON.stringify({
          text,
        }),
        mentions: overrides?.mentions ?? [],
      },
    },
  };
}

export function createHarness(options?: {
  agentConfig?: Partial<AgentConfig>;
  transport?: CodexTransport;
  transportScript?: Parameters<typeof createScriptedCodexTransport>[0];
  heartbeatTtlMs?: number;
  allowChatIds?: string[];
  triggerConfig?: Partial<RuntimeConfig["triggers"]>;
  workspaceResolver?: Partial<RuntimeConfig["workspaceResolver"]>;
  delivery?: {
    failSendMessage?: boolean;
  };
  presentation?: {
    failCardCreate?: boolean;
    failCardUpdate?: boolean;
  };
}) {
  let currentTime = Date.parse("2026-03-08T00:00:00.000Z");
  const now = () => new Date(currentTime);
  const repositories = createInMemoryRepositories();
  const logger = createRuntimeLogger();
  const uniqueSuffix = Math.random().toString(36).slice(2, 10);
  const inputAgentConfig: AgentConfig = {
    ...TEST_AGENT_CONFIG,
    ...options?.agentConfig,
  };
  const managedWorkspaceRoot =
    options?.workspaceResolver?.managedWorkspaceRoot ?? `/tmp/carvis-managed-workspaces-${uniqueSuffix}`;
  const defaultWorkspacePath =
    options?.workspaceResolver?.registry?.[inputAgentConfig.defaultWorkspace] ??
    `${managedWorkspaceRoot}/${inputAgentConfig.defaultWorkspace}`;
  const agentConfig: AgentConfig = {
    ...inputAgentConfig,
    workspace: defaultWorkspacePath,
  };
  const workspaceResolverConfig: RuntimeConfig["workspaceResolver"] = {
    registry: {
      [agentConfig.defaultWorkspace]: agentConfig.workspace,
      ...options?.workspaceResolver?.registry,
    },
    chatBindings: {
      ...options?.workspaceResolver?.chatBindings,
    },
    managedWorkspaceRoot,
    templatePath: options?.workspaceResolver?.templatePath ?? `/tmp/carvis-template-${uniqueSuffix}`,
  };
  const triggerConfig: RuntimeConfig["triggers"] = {
    scheduledJobs: options?.triggerConfig?.scheduledJobs ?? [],
    webhooks: options?.triggerConfig?.webhooks ?? [],
  };
  for (const workspacePath of Object.values(workspaceResolverConfig.registry)) {
    mkdirSync(workspacePath, { recursive: true });
  }
  mkdirSync(workspaceResolverConfig.managedWorkspaceRoot, { recursive: true });
  mkdirSync(workspaceResolverConfig.templatePath, { recursive: true });
  writeStarterTemplate(workspaceResolverConfig.templatePath);
  const queue = new RunQueue();
  const workspaceLocks = new WorkspaceLockManager();
  const cancelSignals = new CancelSignalStore();
  const heartbeats = new HeartbeatMonitor({
    ttlMs: options?.heartbeatTtlMs ?? 1_000,
  });
  const reactionOperations: Array<{
    action: "add" | "remove";
    emojiType: string;
    messageId: string;
  }> = [];
  const sentMessages: OutboundMessage[] = [];
  const bridgeRequests: RunRequest[] = [];
  const presentationOperations: Array<
    | {
        action: "create-card";
        body: string;
        chatId: string;
        runId: string;
        title: string;
      }
    | {
        action: "complete-card";
        body: string;
        cardId: string;
        elementId: string;
        runId: string;
        status: "completed" | "failed" | "cancelled";
        title: string;
      }
    | {
        action: "update-card";
        cardId: string;
        elementId: string;
        runId: string;
        text: string;
      }
    | {
        action: "send-fallback-terminal";
        chatId: string;
        content: string;
        runId: string;
        title: string;
      }
  > = [];
  const presentationSender = {
    async completeCard(input: {
      cardId: string;
      elementId: string;
      runId: string;
      status: "completed" | "failed" | "cancelled";
      title: string;
      body: string;
    }) {
      if (options?.presentation?.failCardUpdate) {
        throw new Error("presentation complete failed");
      }
      presentationOperations.push({
        action: "complete-card",
        body: input.body,
        cardId: input.cardId,
        elementId: input.elementId,
        runId: input.runId,
        status: input.status,
        title: input.title,
      });
    },
    async createCard(input: { chatId: string; runId: string; title: string; body: string }) {
      if (options?.presentation?.failCardCreate) {
        throw new Error("presentation create failed");
      }
      presentationOperations.push({
        action: "create-card",
        body: input.body,
        chatId: input.chatId,
        runId: input.runId,
        title: input.title,
      });

      return {
        cardId: `card-${presentationOperations.length}`,
        elementId: `element-${presentationOperations.length}`,
        messageId: `message-${presentationOperations.length}`,
      };
    },
    async sendFallbackTerminal(input: { chatId: string; runId: string; title: string; content: string }) {
      presentationOperations.push({
        action: "send-fallback-terminal",
        chatId: input.chatId,
        content: input.content,
        runId: input.runId,
        title: input.title,
      });

      return {
        messageId: `fallback-terminal-${presentationOperations.length}`,
      };
    },
    async updateCard(input: { cardId: string; elementId: string; runId: string; text: string }) {
      if (options?.presentation?.failCardUpdate) {
        throw new Error("presentation update failed");
      }
      presentationOperations.push({
        action: "update-card",
        cardId: input.cardId,
        elementId: input.elementId,
        runId: input.runId,
        text: input.text,
      });
    },
  };
  const adapter = new FeishuAdapter({
    signingSecret: "test-secret",
    sender: {
      sendMessage: async (message: OutboundMessage) => {
        if (options?.delivery?.failSendMessage) {
          throw new Error("send message failed");
        }
        sentMessages.push(message);
        return {
          messageId: `delivery-${Math.random().toString(36).slice(2, 10)}`,
        };
      },
      addReaction: async (messageId: string, emojiType: string) => {
        reactionOperations.push({
          action: "add",
          emojiType,
          messageId,
        });
      },
      removeReaction: async (messageId: string, emojiType: string) => {
        reactionOperations.push({
          action: "remove",
          emojiType,
          messageId,
        });
      },
      completeCard: presentationSender.completeCard,
      createCard: presentationSender.createCard,
      sendFallbackTerminal: presentationSender.sendFallbackTerminal,
      updateCard: presentationSender.updateCard,
    },
  });
  const presentationOrchestrator = createPresentationOrchestrator({
    repositories,
    sender: presentationSender,
  });
  const notifier = createRunNotifier({
    adapter,
    presentationOrchestrator,
    repositories,
  });
  const triggerDispatcher = createTriggerDispatcher({
    agentConfig,
    logger,
    notifier,
    queue,
    repositories,
    now,
  });
  const triggerDefinitionSync = createTriggerDefinitionSync({
    config: triggerConfig,
    repositories,
    workspaceResolverConfig,
    now,
  });
  const scheduler = createSchedulerLoop({
    logger,
    repositories,
    triggerDispatcher,
    now,
  });
  const triggerStatusPresenter = createTriggerStatusPresenter({
    repositories,
  });
  const transport =
    options?.transport ??
    createScriptedCodexTransport(
      options?.transportScript ?? [
        { type: "summary", summary: "正在分析仓库", sequence: 1 },
        { type: "result", resultSummary: "仓库目标已总结" },
      ],
    );
  const bridge = new CodexBridge({
    transport: {
      async *run(request, input) {
        bridgeRequests.push(request);
        for await (const chunk of transport.run(request, input)) {
          yield chunk;
        }
      },
    },
    now,
  });
  const gateway = createGatewayApp({
    agentConfig,
    adapter,
    repositories,
    queue,
    workspaceResolverConfig,
    cancelSignals,
    logger,
    allowlist: createAllowlistGuard({
      allowedChatIds: options?.allowChatIds,
    }),
    notifier,
    now,
    triggerConfig,
  });
  const executor = createExecutorWorker({
    agentConfig,
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

  async function postFeishuText(text: string, overrides?: FeishuPayloadOverrides) {
    const payload = createFeishuPayload(text, overrides);
    const body = JSON.stringify(payload);

    return gateway.request("http://localhost/webhooks/feishu", {
      method: "POST",
      headers: createSignedHeaders(body),
      body,
    });
  }


  async function postExternalWebhook(
    slug: string,
    payload: Record<string, unknown>,
    options?: {
      secret?: string;
      timestamp?: string;
    },
  ) {
    await triggerDefinitionSync.syncDefinitions();
    const body = JSON.stringify(payload);
    const timestamp = options?.timestamp ?? String(Math.floor(now().getTime() / 1_000));
    const secret = options?.secret ?? triggerConfig.webhooks.find((candidate) => candidate.slug === slug)?.secret ?? "test-secret";
    const signature = signExternalWebhookBody({
      body,
      secret,
      timestamp,
    });

    return gateway.request(`http://localhost/webhooks/external/${slug}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-carvis-webhook-signature": signature,
        "x-carvis-webhook-timestamp": timestamp,
      },
      body,
    });
  }

  async function getInternalTriggers(path = "/internal/triggers/definitions", query?: Record<string, string>) {
    const search = query ? `?${new URLSearchParams(query).toString()}` : "";
    return gateway.request(`http://localhost${path}${search}`, {
      method: "GET",
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
    agentConfig,
    bridge,
    bridgeRequests,
    cancelSignals,
    executor,
    gateway,
    getInternalTriggers,
    heartbeats,
    logger,
    notifier,
    postFeishuText,
    postExternalWebhook,
    presentationOrchestrator,
    presentationOperations,
    presentationSender,
    queue,
    reactionOperations,
    reaper,
    repositories,
    scheduler,
    sentMessages,
    syncTriggerDefinitions: async () => triggerDefinitionSync.syncDefinitions(),
    triggerConfig,
    triggerDefinitionSync,
    triggerDispatcher,
    triggerStatusPresenter,
    workspaceLocks,
    workspaceResolverConfig,
    listRunStatuses,
    waitForHeartbeat,
    waitForRunStatus,
  };
}

function writeStarterTemplate(templatePath: string) {
  writeFileSync(`${templatePath}/README.md`, "# template\n\nManaged workspace starter.\n");
  writeFileSync(`${templatePath}/.gitignore`, ".DS_Store\nnode_modules/\n.codex/\n");
  writeFileSync(`${templatePath}/AGENTS.md`, "This is a managed workspace starter.\n");
}
