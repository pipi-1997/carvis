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
import { handleStatusCommand } from "./commands/status.ts";
import { createAllowlistGuard } from "./security/allowlist.ts";
import { createRunNotifier } from "./services/run-notifier.ts";
import { createRunReaper } from "./services/run-reaper.ts";
import { createGatewayRuntimeHealth } from "./services/runtime-health.ts";

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
  });
  const adapter = new FeishuAdapter({
    signingSecret: services.config.secrets.feishuAppSecret,
    sender,
  });
  const notifier = createRunNotifier({
    adapter,
    repositories: services.repositories,
  });
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
  const app = createGatewayApp({
    agentConfig: services.config.agent,
    adapter,
    repositories: services.repositories,
    queue: services.queue,
    cancelSignals: services.cancelSignals,
    allowlist: createAllowlistGuard(buildAllowlistOptions(services.config.agent, services.config.feishu.allowFrom)),
    notifier,
    health: runtimeHealth,
    healthPath: services.config.gateway.healthPath,
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

      if (envelope.command === "status") {
        const message = await handleStatusCommand({
          session,
          agentConfig: services.config.agent,
          repositories: services.repositories,
          queue: services.queue,
        });
        await notifier.sendMessage(message);
        return;
      }

      if (envelope.command === "abort") {
        const message = await handleAbortCommand({
          session,
          agentConfig: services.config.agent,
          repositories: services.repositories,
          cancelSignals: services.cancelSignals,
        });
        await notifier.sendMessage(message);
        return;
      }

      if (!envelope.prompt) {
        return;
      }

      const activeRun = await services.repositories.runs.findActiveRunByWorkspace(services.config.agent.workspace);
      const run = await services.repositories.runs.createQueuedRun({
        sessionId: session.id,
        agentId: services.config.agent.id,
        workspace: services.config.agent.workspace,
        prompt: envelope.prompt,
        triggerMessageId: envelope.messageId,
        triggerUserId: envelope.userId,
        timeoutSeconds: services.config.agent.timeoutSeconds,
      });
      const queuePosition = (await services.queue.enqueue(services.config.agent.workspace, run.id)) + (activeRun ? 1 : 0);
      await services.repositories.runs.updateQueuePosition(run.id, queuePosition);
      const queuedEvent = await services.repositories.events.appendEvent({
        runId: run.id,
        eventType: "run.queued",
        payload: {
          run_id: run.id,
          workspace: services.config.agent.workspace,
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
