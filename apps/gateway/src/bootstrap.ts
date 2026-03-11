import { FeishuAdapter, createFeishuRuntimeSender, createFeishuWebsocketIngress } from "@carvis/channel-feishu";
import type {
  AgentConfig,
  CancelSignalDriver,
  HeartbeatDriver,
  QueueDriver,
  RepositoryBundle,
  RuntimeConfig,
  WorkspaceLockDriver,
} from "@carvis/core";
import { buildRuntimeScope, createRuntimeServices, detectRuntimeFingerprintDrift, publishRuntimeFingerprint } from "@carvis/core";

import { createGatewayApp } from "./app.ts";
import { handleAbortCommand } from "./commands/abort.ts";
import { handleBindCommand } from "./commands/bind.ts";
import { handleHelpCommand } from "./commands/help.ts";
import { handleNewCommand } from "./commands/new.ts";
import { handleStatusCommand } from "./commands/status.ts";
import { createAllowlistGuard } from "./security/allowlist.ts";
import { createPresentationOrchestrator } from "./services/presentation-orchestrator.ts";
import { createRunNotifier } from "./services/run-notifier.ts";
import { createRunReaper } from "./services/run-reaper.ts";
import { createGatewayRuntimeHealth } from "./services/runtime-health.ts";
import { createScheduleManagementPromptBuilder } from "./services/schedule-management-prompt.ts";
import { createSchedulerLoop } from "./services/scheduler-loop.ts";
import { resolveRequestedSession } from "./services/continuation-binding.ts";
import { createTriggerDefinitionSync } from "./services/trigger-definition-sync.ts";
import { createTriggerDispatcher } from "./services/trigger-dispatcher.ts";
import { createTriggerStatusPresenter } from "./services/trigger-status-presenter.ts";
import { createWorkspaceProvisioner } from "./services/workspace-provisioner.ts";
import { createWorkspaceResolver } from "./services/workspace-resolver.ts";

type GatewayRuntimeServicesLike = {
  cancelSignals: CancelSignalDriver;
  config: RuntimeConfig;
  configFingerprint: string;
  heartbeats: HeartbeatDriver;
  logger: ReturnType<typeof import("@carvis/core").createRuntimeLogger>;
  postgres: {
    close(): Promise<void>;
  };
  queue: QueueDriver;
  redis: {
    close(): Promise<void>;
    raw: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string, mode?: "NX"): Promise<string | null>;
    };
  };
  repositories: RepositoryBundle;
  runtimeScope?: string;
  workspaceLocks: WorkspaceLockDriver;
};

export type BootstrapGatewayRuntimeOptions = {
  createFeishuIngress?: ((
    options: Parameters<typeof createFeishuWebsocketIngress>[0],
  ) => Promise<ReturnType<typeof createFeishuWebsocketIngress>> | ReturnType<typeof createFeishuWebsocketIngress>);
  createRunReaper?: (
    input: Parameters<typeof createRunReaper>[0],
  ) => ReturnType<typeof createRunReaper>;
  createRuntimeServices?: (options?: { env?: Record<string, string | undefined> }) => Promise<GatewayRuntimeServicesLike>;
  env?: Record<string, string | undefined>;
  transportFactory?: Parameters<typeof createFeishuWebsocketIngress>[0]["transportFactory"];
};

export async function bootstrapGatewayRuntime(options: BootstrapGatewayRuntimeOptions = {}) {
  const runtimeServicesFactory = options.createRuntimeServices ?? ((input) => createRuntimeServices({ env: input?.env }));
  const services = await runtimeServicesFactory({ env: options.env });
  const runtimeScope = services.runtimeScope ?? buildRuntimeScope({
    agentId: services.config.agent.id,
    env: options.env,
  });
  const health = createGatewayRuntimeHealth({
    configFingerprint: services.configFingerprint,
  });
  const sender = createFeishuRuntimeSender({
    appId: services.config.secrets.feishuAppId,
    appSecret: services.config.secrets.feishuAppSecret,
    failCardCreate: options.env?.CARVIS_FAIL_CARD_CREATE === "1",
    failCardUpdate: options.env?.CARVIS_FAIL_CARD_UPDATE === "1",
  });
  const adapter = new FeishuAdapter({
    signingSecret: services.config.secrets.feishuAppSecret,
    sender,
  });
  const presentationOrchestrator = createPresentationOrchestrator({
    logger: services.logger,
    now: () => new Date(),
    repositories: services.repositories,
    sender: adapter,
  });
  const notifier = createRunNotifier({
    adapter,
    presentationOrchestrator,
    repositories: services.repositories,
  });
  const triggerDispatcher = createTriggerDispatcher({
    agentConfig: services.config.agent,
    logger: services.logger,
    notifier,
    queue: services.queue,
    repositories: services.repositories,
  });
  const triggerDefinitionSync = createTriggerDefinitionSync({
    config: services.config.triggers,
    repositories: services.repositories,
    workspaceResolverConfig: services.config.workspaceResolver,
  });
  const triggerStatusPresenter = createTriggerStatusPresenter({
    repositories: services.repositories,
  });
  const scheduler = createSchedulerLoop({
    logger: services.logger,
    repositories: services.repositories,
    triggerDispatcher,
  });
  const syncSummary = await triggerDefinitionSync.syncDefinitions();
  for (const definitionId of syncSummary.createdOrUpdated) {
    const definition = await services.repositories.triggerDefinitions.getDefinitionById(definitionId);
    if (!definition) {
      continue;
    }
    services.logger.triggerDefinitionSyncState("runtime_sync_upserted", {
      definitionId,
      sourceType: definition.sourceType,
      enabled: definition.enabled,
      nextDueAt: definition.nextDueAt,
    });
  }
  for (const definitionId of syncSummary.disabled) {
    const definition = await services.repositories.triggerDefinitions.getDefinitionById(definitionId);
    if (!definition) {
      continue;
    }
    services.logger.triggerDefinitionSyncState("runtime_sync_disabled", {
      definitionId,
      sourceType: definition.sourceType,
      enabled: definition.enabled,
      nextDueAt: definition.nextDueAt,
    });
  }
  const logGatewayState = () => {
    services.logger.gatewayState(health.status(), {
      configFingerprint: services.configFingerprint,
      feishuReady: health.state.feishuReady,
      feishuIngressReady: health.state.feishuIngressReady,
      errorCode: health.state.lastError?.code,
      errorMessage: health.state.lastError?.message,
    });
  };
  const runtimeHealth = {
    ...health,
    async refresh() {
      const driftMessage = await detectRuntimeFingerprintDrift(
        services.redis,
        runtimeScope,
        "gateway",
        services.configFingerprint,
      );
      if (driftMessage) {
        health.markConfigDrift(driftMessage);
        return;
      }
      if (health.state.lastError?.code === "CONFIG_DRIFT") {
        health.clearError();
      }
    },
  };
  const reaperFactory = options.createRunReaper ?? createRunReaper;
  const reaper = reaperFactory({
    repositories: services.repositories,
    heartbeats: services.heartbeats,
    queue: services.queue,
    workspaceLocks: services.workspaceLocks,
    notifier,
    cancelSignals: services.cancelSignals,
  });
  const workspaceProvisioner = createWorkspaceProvisioner({
    repositories: services.repositories,
    workspaceResolverConfig: services.config.workspaceResolver,
  });
  const workspaceResolver = createWorkspaceResolver({
    agentConfig: services.config.agent,
    repositories: services.repositories,
    workspaceResolverConfig: services.config.workspaceResolver,
    workspaceProvisioner,
  });
  const scheduleManagementPromptBuilder = createScheduleManagementPromptBuilder();
  const app = createGatewayApp({
    agentConfig: services.config.agent,
    adapter,
    repositories: services.repositories,
    queue: services.queue,
    workspaceResolverConfig: services.config.workspaceResolver,
    cancelSignals: services.cancelSignals,
    allowlist: createAllowlistGuard(buildAllowlistOptions(services.config.agent, services.config.feishu.allowFrom)),
    logger: services.logger,
    notifier,
    health: runtimeHealth,
    healthPath: services.config.gateway.healthPath,
    triggerConfig: services.config.triggers,
  });
  const ingressFactory = options.createFeishuIngress ?? createFeishuWebsocketIngress;
  const rawIngress = await ingressFactory({
    appId: services.config.secrets.feishuAppId,
    appSecret: services.config.secrets.feishuAppSecret,
    allowFrom: services.config.feishu.allowFrom,
    requireMention: services.config.feishu.requireMention,
    onConnectionStateChange: (state) => {
      if (state.status === "ready") {
        health.markFeishuReady();
        health.markFeishuIngressReady();
        if (health.state.lastError?.code === "FEISHU_WS_DISCONNECTED") {
          health.clearError();
        }
        logGatewayState();
        return;
      }

      health.markFeishuDisconnected(state.message ?? "feishu websocket disconnected");
      logGatewayState();
    },
    onEnvelope: async (envelope) => {
      const session = await services.repositories.sessions.getOrCreateSession({
        channel: envelope.channel,
        chatId: envelope.chatId,
        agentConfig: services.config.agent,
      });

      if (envelope.command) {
        services.logger.commandState("recognized", {
          agentId: services.config.agent.id,
          chatId: session.chatId,
          sessionId: session.id,
          command: envelope.command,
          normalizedText: envelope.rawText,
        });
      }

      if (envelope.unknownCommand) {
        services.logger.commandState("unknown", {
          agentId: services.config.agent.id,
          chatId: session.chatId,
          sessionId: session.id,
          command: envelope.unknownCommand,
          normalizedText: envelope.rawText,
          reason: "unsupported_slash_command",
        });
        const message = await handleHelpCommand({
          session,
          chatType: envelope.chatType,
          unknownCommand: envelope.unknownCommand,
        });
        await notifier.sendMessage(message);
        return;
      }

      if (envelope.command === "status") {
        const message = await handleStatusCommand({
          session,
          chatType: envelope.chatType,
          agentConfig: services.config.agent,
          repositories: services.repositories,
          queue: services.queue,
          workspaceResolverConfig: services.config.workspaceResolver,
        });
        await notifier.sendMessage(message);
        return;
      }

      if (envelope.command === "abort") {
        const message = await handleAbortCommand({
          session,
          repositories: services.repositories,
          cancelSignals: services.cancelSignals,
        });
        await notifier.sendMessage(message);
        return;
      }

      if (envelope.command === "new") {
        const message = await handleNewCommand({
          session,
          agentConfig: services.config.agent,
          repositories: services.repositories,
        });
        await notifier.sendMessage(message);
        return;
      }

      if (envelope.command === "help") {
        const message = await handleHelpCommand({
          session,
          chatType: envelope.chatType,
        });
        await notifier.sendMessage(message);
        return;
      }

      if (envelope.command === "bind") {
        const message = await handleBindCommand({
          session,
          chatType: envelope.chatType,
          workspaceKey: envelope.commandArgs[0] ?? null,
          agentConfig: services.config.agent,
          repositories: services.repositories,
          workspaceResolverConfig: services.config.workspaceResolver,
          logger: services.logger,
        });
        await notifier.sendMessage(message);
        return;
      }

      if (!envelope.prompt) {
        return;
      }

      const binding = await services.repositories.conversationSessionBindings.getBindingBySessionId(session.id);
      const resolvedWorkspace = await workspaceResolver.resolveForPrompt({
        session,
        chatType: envelope.chatType,
      });

      if (resolvedWorkspace.kind === "unbound") {
        services.logger.workspaceResolutionState("unbound", {
          agentId: services.config.agent.id,
          chatId: session.chatId,
          sessionId: session.id,
          trigger: "prompt",
        });
        await notifier.sendMessage({
          chatId: session.chatId,
          runId: null,
          kind: "status",
          content: resolvedWorkspace.message,
        });
        return;
      }

      services.logger.workspaceResolutionState(resolvedWorkspace.bindingSource, {
        agentId: services.config.agent.id,
        chatId: session.chatId,
        sessionId: session.id,
        workspaceKey: resolvedWorkspace.workspaceKey,
        workspacePath: resolvedWorkspace.workspacePath,
        trigger: "prompt",
      });

      const { requestedSessionMode, requestedBridgeSessionId } = resolveRequestedSession({
        binding,
        workspace: resolvedWorkspace.workspacePath,
      });
      const prompt = scheduleManagementPromptBuilder.build({
        workspace: resolvedWorkspace.workspacePath,
        userPrompt: envelope.prompt,
      });
      const activeRun = await services.repositories.runs.findActiveRunByWorkspace(resolvedWorkspace.workspacePath);
      const run = await services.repositories.runs.createQueuedRun({
        sessionId: session.id,
        agentId: services.config.agent.id,
        workspace: resolvedWorkspace.workspacePath,
        prompt,
        managementMode: "none",
        triggerMessageId: envelope.messageId,
        triggerUserId: envelope.userId,
        timeoutSeconds: services.config.agent.timeoutSeconds,
        requestedSessionMode,
        requestedBridgeSessionId,
      });
      const queuePosition =
        (await services.queue.enqueue(resolvedWorkspace.workspacePath, run.id)) + (activeRun ? 1 : 0);
      await services.repositories.runs.updateQueuePosition(run.id, queuePosition);
      const queuedEvent = await services.repositories.events.appendEvent({
        runId: run.id,
        eventType: "run.queued",
        payload: {
          run_id: run.id,
          workspace: resolvedWorkspace.workspacePath,
          queue_position: queuePosition,
        },
      });
      await notifier.notifyRunEvent(session, queuedEvent);
    },
    transportFactory: options.transportFactory,
  });

  const ingress = {
    async start() {
      const result = await rawIngress.start();
      health.markFeishuReady();
      if (result.ready) {
        health.markFeishuIngressReady();
      }
      return result;
    },
    async stop() {
      await rawIngress.stop();
    },
    async emit(event: Parameters<typeof rawIngress.emit>[0]) {
      await rawIngress.emit(event);
    },
  };

  return {
    adapter,
    app,
    health: runtimeHealth,
    ingress,
    notifier,
    reaper,
    scheduler,
    services,
    async publishFingerprint() {
      await publishRuntimeFingerprint(services.redis, runtimeScope, "gateway", services.configFingerprint);
    },
    async stop() {
      await ingress.stop();
      await services.redis.close();
      await services.postgres.close();
    },
  };
}

function buildAllowlistOptions(agentConfig: AgentConfig, allowFrom: string[]) {
  if (allowFrom.includes("*")) {
    return {};
  }

  const allowedChatIds = allowFrom.filter((candidate) => candidate !== agentConfig.id);
  return {
    allowedChatIds,
  };
}
