import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

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
import { runCarvisScheduleCli } from "../../packages/carvis-schedule-cli/src/index.ts";
import { FeishuAdapter } from "../../packages/channel-feishu/src/adapter.ts";
import { FeishuMediaStageError } from "../../packages/channel-feishu/src/runtime-sender.ts";
import type { AgentConfig, OutboundMessage, RunRequest, RunStatus } from "../../packages/core/src/domain/models.ts";
import type { RuntimeConfig } from "../../packages/core/src/domain/runtime-models.ts";
import { createRuntimeLogger } from "../../packages/core/src/observability/runtime-logger.ts";
import { createInMemoryRepositories } from "../../packages/core/src/storage/repositories.ts";
import { CancelSignalStore } from "../../packages/core/src/runtime/cancel-signal.ts";
import { HeartbeatMonitor } from "../../packages/core/src/runtime/heartbeat.ts";
import { RunQueue } from "../../packages/core/src/runtime/queue.ts";
import { ensureWorkspaceTemplateScaffoldSync } from "../../packages/core/src/runtime/workspace-template.ts";
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
  transportFactory?: (input: {
    agentConfig: AgentConfig;
    gateway: ReturnType<typeof createGatewayApp>;
  }) => CodexTransport;
  transportScript?: Parameters<typeof createScriptedCodexTransport>[0];
  heartbeatTtlMs?: number;
  allowChatIds?: string[];
  triggerConfig?: Partial<RuntimeConfig["triggers"]>;
  workspaceResolver?: Partial<RuntimeConfig["workspaceResolver"]>;
  delivery?: {
    failSendMessage?: boolean;
    failUploadFile?: boolean;
    failUploadImage?: boolean;
    failSendFile?: boolean;
    failSendImage?: boolean;
  };
  presentation?: {
    failCardCreate?: boolean;
    failCardUpdate?: boolean;
    failFallbackTerminal?: boolean;
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
  const workspaceRegistry: RuntimeConfig["workspaceResolver"]["registry"] = {
    [agentConfig.defaultWorkspace]: agentConfig.workspace,
    ...options?.workspaceResolver?.registry,
  };
  const workspaceResolverConfig: RuntimeConfig["workspaceResolver"] = {
    registry: workspaceRegistry,
    chatBindings: {
      ...options?.workspaceResolver?.chatBindings,
    },
    sandboxModes: Object.fromEntries(
      Object.keys(workspaceRegistry).map((workspaceKey) => [workspaceKey, "workspace-write"]),
    ) as RuntimeConfig["workspaceResolver"]["sandboxModes"],
    ...(options?.workspaceResolver?.sandboxModes
      ? {
          sandboxModes: {
            ...Object.fromEntries(
              Object.keys(workspaceRegistry).map((workspaceKey) => [workspaceKey, "workspace-write"]),
            ),
            ...options.workspaceResolver.sandboxModes,
          } as RuntimeConfig["workspaceResolver"]["sandboxModes"],
        }
      : {}),
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
  const mediaOperations: Array<
    | {
        action: "send-image";
        chatId: string;
        fileName: string;
        runId: string;
      }
    | {
        action: "send-file";
        chatId: string;
        fileName: string;
        runId: string;
      }
  > = [];
  const uploadedMediaNames = new Map<string, string>();
  const sentMessages: OutboundMessage[] = [];
  const bridgeRequests: RunRequest[] = [];
  const memoryBenchmarkTrace = {
    bridgeRequests: [] as Array<{
      prompt: string;
      workspace: string;
      sessionMode: string;
    }>,
    memoryWriteObservations: [] as Array<{
      targetPath: string;
      changeType: "long_term" | "daily";
      changed: boolean;
      summary: string;
    }>,
    manualEditPaths: [] as string[],
    memoryFlushObservation: {
      triggered: false,
      changed: false,
      targetPath: null as string | null,
      writeCount: 0,
    },
    memoryExcerpt: {
      excerptText: "",
      sources: [] as string[],
      selectedSections: [] as string[],
      approxTokens: 0,
    },
    preflightLatencyMs: 0,
    filesScanned: 0,
    userVisibleOutputs: [] as Array<{
      kind: string;
      content: string;
    }>,
  };
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
      if (options?.presentation?.failFallbackTerminal) {
        throw new Error("presentation fallback terminal failed");
      }
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
        memoryBenchmarkTrace.userVisibleOutputs.push({
          kind: message.kind,
          content: message.content,
        });
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
      uploadImage: async (input: {
        chatId: string;
        runId: string;
        fileName: string;
        content: Uint8Array;
      }) => {
        if (options?.delivery?.failUploadImage) {
          throw new FeishuMediaStageError("upload", "upload image failed");
        }
        const targetRef = `img-${Math.random().toString(36).slice(2, 10)}`;
        uploadedMediaNames.set(targetRef, input.fileName);
        return { targetRef };
      },
      deliverImage: async (input: {
        chatId: string;
        runId: string;
        targetRef: string;
      }) => {
        if (options?.delivery?.failSendImage) {
          throw new FeishuMediaStageError("delivery", "send image failed");
        }
        mediaOperations.push({
          action: "send-image",
          chatId: input.chatId,
          fileName: uploadedMediaNames.get(input.targetRef) ?? input.targetRef,
          runId: input.runId,
        });
        return {
          messageId: `image-${Math.random().toString(36).slice(2, 10)}`,
        };
      },
      sendImage: async (input: {
        chatId: string;
        runId: string;
        fileName: string;
        content: Uint8Array;
      }) => {
        if (options?.delivery?.failUploadImage) {
          throw new FeishuMediaStageError("upload", "upload image failed");
        }
        if (options?.delivery?.failSendImage) {
          throw new FeishuMediaStageError("delivery", "send image failed");
        }
        mediaOperations.push({
          action: "send-image",
          chatId: input.chatId,
          fileName: input.fileName,
          runId: input.runId,
        });
        return {
          messageId: `image-${Math.random().toString(36).slice(2, 10)}`,
          targetRef: `img-${Math.random().toString(36).slice(2, 10)}`,
        };
      },
      uploadFile: async (input: {
        chatId: string;
        runId: string;
        fileName: string;
        content: Uint8Array;
      }) => {
        if (options?.delivery?.failUploadFile) {
          throw new FeishuMediaStageError("upload", "upload file failed");
        }
        const targetRef = `file-${Math.random().toString(36).slice(2, 10)}`;
        uploadedMediaNames.set(targetRef, input.fileName);
        return { targetRef };
      },
      deliverFile: async (input: {
        chatId: string;
        runId: string;
        targetRef: string;
      }) => {
        if (options?.delivery?.failSendFile) {
          throw new FeishuMediaStageError("delivery", "send file failed");
        }
        mediaOperations.push({
          action: "send-file",
          chatId: input.chatId,
          fileName: uploadedMediaNames.get(input.targetRef) ?? input.targetRef,
          runId: input.runId,
        });
        return {
          messageId: `file-${Math.random().toString(36).slice(2, 10)}`,
        };
      },
      sendFile: async (input: {
        chatId: string;
        runId: string;
        fileName: string;
        content: Uint8Array;
      }) => {
        if (options?.delivery?.failUploadFile) {
          throw new FeishuMediaStageError("upload", "upload file failed");
        }
        if (options?.delivery?.failSendFile) {
          throw new FeishuMediaStageError("delivery", "send file failed");
        }
        mediaOperations.push({
          action: "send-file",
          chatId: input.chatId,
          fileName: input.fileName,
          runId: input.runId,
        });
        return {
          messageId: `file-${Math.random().toString(36).slice(2, 10)}`,
          targetRef: `file-${Math.random().toString(36).slice(2, 10)}`,
        };
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
    workspaceResolverConfig,
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
  const transport =
    options?.transport ??
    options?.transportFactory?.({
      agentConfig,
      gateway,
    }) ??
    createScriptedCodexTransport(
      options?.transportScript ?? [
        { type: "summary", summary: "正在分析仓库", sequence: 1 },
        { type: "result", resultSummary: "仓库目标已总结" },
      ],
    );
  const bridge = new CodexBridge({
    transport: {
      run(request, input) {
        bridgeRequests.push(request);
        memoryBenchmarkTrace.bridgeRequests.push({
          prompt: request.prompt,
          workspace: request.workspace,
          sessionMode: request.sessionMode ?? "fresh",
        });
        const rawTransportRun = transport.run(request, input);
        const transportRun = "stream" in rawTransportRun
          ? rawTransportRun
          : {
              stream() {
                return rawTransportRun;
              },
              [Symbol.asyncIterator]() {
                return rawTransportRun[Symbol.asyncIterator]();
              },
            };
        return {
          stream() {
            return transportRun.stream();
          },
          async submitToolResult(payload) {
            if ("submitToolResult" in transportRun && typeof transportRun.submitToolResult === "function") {
              await transportRun.submitToolResult(payload);
            }
          },
          [Symbol.asyncIterator]() {
            return transportRun.stream()[Symbol.asyncIterator]();
          },
        };
      },
    },
    now,
  });
  const executorWorker = createExecutorWorker({
    agentConfig,
    repositories,
    queue,
    workspaceLocks,
    cancelSignals,
    heartbeats,
    bridge,
    toolInvoker: {
      async execute({ run, session, toolName, arguments: args }) {
        const response = await gateway.request("http://localhost/internal/run-tools/execute", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            runId: run.id,
            toolName,
            invocation: args,
            workspace: run.workspace,
            sessionId: session?.id ?? "",
            chatId: session?.chatId ?? "",
            userId: run.triggerUserId,
            requestedText: run.prompt,
          }),
        });
        const payload = await response.json() as { result: Record<string, unknown> };
        return payload.result;
      },
    },
    logger,
    notifier,
    now,
  });
  function syncMemoryBenchmarkTraceFromLogs() {
    const entries = logger.listEntries();
    const writeEntries = entries.filter((entry) => entry.message === "workspace.memory.write");
    memoryBenchmarkTrace.memoryWriteObservations = writeEntries.map((entry) => ({
      targetPath: String(entry.context?.targetPath ?? ""),
      changeType: (entry.context?.changeType === "daily" ? "daily" : "long_term"),
      changed: true,
      summary: String(entry.context?.summary ?? ""),
    }));
    const latestPreflight = [...entries].reverse().find((entry) => entry.message === "workspace.memory.preflight");
    const latestFlush = [...entries].reverse().find((entry) => entry.message === "workspace.memory.flush");
    if (!latestPreflight) {
      if (latestFlush) {
        memoryBenchmarkTrace.memoryFlushObservation = {
          triggered: true,
          changed: Boolean(latestFlush.context?.changed),
          targetPath: latestFlush.context?.targetPath ? String(latestFlush.context.targetPath) : null,
          writeCount: Number(latestFlush.context?.writeCount ?? 0),
        };
      }
      return;
    }
    memoryBenchmarkTrace.memoryExcerpt = {
      excerptText: String(latestPreflight.context?.excerptText ?? ""),
      sources: Array.isArray(latestPreflight.context?.sources)
        ? latestPreflight.context.sources.map((item) => String(item))
        : [],
      selectedSections: Array.isArray(latestPreflight.context?.selectedSections)
        ? latestPreflight.context.selectedSections.map((item) => String(item))
        : [],
      approxTokens: Math.ceil(String(latestPreflight.context?.excerptText ?? "").length / 4),
    };
    memoryBenchmarkTrace.preflightLatencyMs = Number(latestPreflight.context?.preflightLatencyMs ?? 0);
    memoryBenchmarkTrace.filesScanned = Number(latestPreflight.context?.filesScanned ?? 0);
    memoryBenchmarkTrace.memoryFlushObservation = latestFlush
      ? {
          triggered: true,
          changed: Boolean(latestFlush.context?.changed),
          targetPath: latestFlush.context?.targetPath ? String(latestFlush.context.targetPath) : null,
          writeCount: Number(latestFlush.context?.writeCount ?? 0),
        }
      : {
          triggered: false,
          changed: false,
          targetPath: null,
          writeCount: 0,
        };
  }
  let lastObservedManualHashes = snapshotWorkspaceMemoryFiles(agentConfig.workspace);
  const reaper = createRunReaper({
    repositories,
    heartbeats,
    queue,
    workspaceLocks,
    logger,
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

  async function getInternalManagedSchedules(path = "/internal/managed-schedules", query?: Record<string, string>) {
    const search = query ? `?${new URLSearchParams(query).toString()}` : "";
    return gateway.request(`http://localhost${path}${search}`, {
      method: "GET",
    });
  }

  async function getInternalRunMedia(path = "/internal/run-media", query?: Record<string, string>) {
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
    executor: {
      async processNext() {
        const beforeHashes = snapshotWorkspaceMemoryFiles(agentConfig.workspace);
        memoryBenchmarkTrace.manualEditPaths = diffWorkspaceMemoryHashes(lastObservedManualHashes, beforeHashes);
        const result = await executorWorker.processNext();
        syncMemoryBenchmarkTraceFromLogs();
        lastObservedManualHashes = snapshotWorkspaceMemoryFiles(agentConfig.workspace);
        return result;
      },
    },
    gateway,
    getInternalTriggers,
    getInternalManagedSchedules,
    getInternalRunMedia,
    heartbeats,
    logger,
    memoryBenchmarkTrace,
    mediaOperations,
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

export function createCliDrivenCodexTransport(input: {
  command(argv: string[], request: RunRequest): string[];
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response> | Response;
}) : CodexTransport {
  return {
    run(request, _options) {
      const transportRun = {
        async *stream() {
          const stdout: string[] = [];
          const stderr: string[] = [];
          const exitCode = await runCarvisScheduleCli(
            input.command(buildCliContextArgs(request), request),
            {
              fetchImpl: input.fetchImpl,
              stdout(text) {
                stdout.push(text);
              },
              stderr(text) {
                stderr.push(text);
              },
            },
          );

          const parsed = JSON.parse(stdout.at(-1) ?? "null") as {
            status?: string;
            summary?: string;
          } | null;

          if (exitCode === 4) {
            yield {
              type: "error" as const,
              failureCode: "codex_exec_failed",
              failureMessage: stderr.join("\n") || String(parsed?.summary ?? "carvis-schedule failed"),
              sessionInvalid: false,
            };
            return;
          }

          yield {
            type: "result" as const,
            resultSummary: String(parsed?.summary ?? "carvis-schedule completed"),
            sessionOutcome: (request.bridgeSessionId ? "continued" : "unchanged") as "continued" | "unchanged",
          };
        },
        async submitToolResult() {
          return;
        },
        [Symbol.asyncIterator]() {
          return transportRun.stream()[Symbol.asyncIterator]();
        },
      };
      return transportRun;
    },
  };
}

function buildCliContextArgs(request: RunRequest) {
  const args = [
    "--gateway-base-url",
    "http://localhost",
    "--workspace",
    request.workspace,
    "--session-id",
    request.sessionId ?? "",
    "--chat-id",
    request.chatId ?? "",
    "--requested-text",
    extractOriginalUserPrompt(request.prompt),
  ];
  if (request.triggerUserId) {
    args.push("--user-id", request.triggerUserId);
  }
  return args;
}

function extractOriginalUserPrompt(prompt: string) {
  const marker = 'Original user request JSON: ';
  const markerIndex = prompt.indexOf(marker);
  if (markerIndex < 0) {
    return prompt;
  }

  try {
    const parsed = JSON.parse(prompt.slice(markerIndex + marker.length).trim()) as unknown;
    return typeof parsed === "string" ? parsed : prompt;
  } catch {
    return prompt;
  }
}

function writeStarterTemplate(templatePath: string) {
  writeFileSync(`${templatePath}/README.md`, "# template\n\nManaged workspace starter.\n");
  writeFileSync(`${templatePath}/.gitignore`, ".DS_Store\nnode_modules/\n.codex/\n");
  writeFileSync(`${templatePath}/AGENTS.md`, "This is a managed workspace starter.\n");
  ensureWorkspaceTemplateScaffoldSync(templatePath);
}

function snapshotWorkspaceMemoryFiles(workspacePath: string): Map<string, string> {
  const result = new Map<string, string>();
  const carvisDir = path.join(workspacePath, ".carvis");
  const memoryPath = path.join(carvisDir, "MEMORY.md");
  try {
    const stat = statSync(memoryPath);
    if (stat.isFile()) {
      result.set(".carvis/MEMORY.md", createHash("sha256").update(readFileSync(memoryPath, "utf8")).digest("hex"));
    }
  } catch {}
  const dailyDir = path.join(carvisDir, "memory");
  try {
    for (const entry of readdirSync(dailyDir)) {
      const absolute = path.join(dailyDir, entry);
      const stat = statSync(absolute);
      if (!stat.isFile()) continue;
      result.set(
        path.join(".carvis", "memory", entry).replace(/\\/g, "/"),
        createHash("sha256").update(readFileSync(absolute, "utf8")).digest("hex"),
      );
    }
  } catch {}
  return result;
}

function diffWorkspaceMemoryHashes(
  previous: Map<string, string>,
  current: Map<string, string>,
): string[] {
  const changed = new Set<string>();
  for (const [filePath, hash] of current.entries()) {
    if (previous.get(filePath) !== hash) {
      changed.add(filePath);
    }
  }
  for (const filePath of previous.keys()) {
    if (!current.has(filePath)) {
      changed.add(filePath);
    }
  }
  return [...changed];
}
