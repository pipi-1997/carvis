import type {
  CancelSignalDriver,
  HeartbeatDriver,
  OutboundMessage,
  QueueDriver,
  RepositoryBundle,
  RunEvent,
  RuntimeConfig,
  WorkspaceLockDriver,
} from "@carvis/core";
import { buildRuntimeScope, createRuntimeServices, detectRuntimeFingerprintDrift, publishRuntimeFingerprint } from "@carvis/core";
import { CodexBridge, codexCliHealthcheck, createCodexCliTransport, createScriptedCodexTransport } from "@carvis/bridge-codex";
import { FeishuAdapter, createFeishuRuntimeSender } from "@carvis/channel-feishu";

import { createExecutorWorker } from "./worker.ts";

const WORKING_REACTION_EMOJI = "OK";

type ExecutorRuntimeServicesLike = {
  cancelSignals: CancelSignalDriver;
  config: RuntimeConfig;
  configFingerprint: string;
  heartbeats: HeartbeatDriver;
  logger: ReturnType<typeof import("@carvis/core").createRuntimeLogger>;
  postgres: {
    close(): Promise<void>;
    ping(): Promise<boolean>;
  };
  queue: QueueDriver;
  redis: {
    close(): Promise<void>;
    ping(): Promise<boolean>;
    raw: {
      get(key: string): Promise<string | null>;
      set(key: string, value: string, mode?: "NX"): Promise<string | null>;
    };
  };
  repositories: RepositoryBundle;
  runtimeScope?: string;
  workspaceLocks: WorkspaceLockDriver;
};

export type BootstrapExecutorRuntimeOptions = {
  createBridge?: () => CodexBridge;
  createRuntimeServices?: (options?: { env?: Record<string, string | undefined> }) => Promise<ExecutorRuntimeServicesLike>;
  env?: Record<string, string | undefined>;
};

export async function bootstrapExecutorRuntime(options: BootstrapExecutorRuntimeOptions = {}) {
  const runtimeServicesFactory = options.createRuntimeServices ?? ((input) => createRuntimeServices({ env: input?.env }));
  const services = await runtimeServicesFactory({ env: options.env });
  const runtimeScope = services.runtimeScope ?? buildRuntimeScope({
    agentId: services.config.agent.id,
    env: options.env,
  });
  const bridge =
    options.createBridge?.() ??
    new CodexBridge({
      healthcheck: () => codexCliHealthcheck(),
      transport: createCodexCliTransport(),
    });
  const adapter = new FeishuAdapter({
    signingSecret: services.config.secrets.feishuAppSecret,
    sender: createFeishuRuntimeSender({
      appId: services.config.secrets.feishuAppId,
      appSecret: services.config.secrets.feishuAppSecret,
    }),
  });
  const notifier = {
    async notifyRunEvent(session: { chatId: string }, event: RunEvent) {
      const run = await services.repositories.runs.getRunById(event.runId);

      if (event.eventType === "run.started" || event.eventType === "agent.summary") {
        return;
      }

      if (run?.triggerMessageId) {
        await adapter.removeReaction(run.triggerMessageId, WORKING_REACTION_EMOJI).catch(() => {});
      }

      const message = formatRunEventMessage(session.chatId, event);
      const delivery = await services.repositories.deliveries.createDelivery({
        runId: message.runId,
        chatId: message.chatId,
        deliveryKind: message.kind,
        content: message.content,
      });

      try {
        await adapter.sendMessage(message);
        await services.repositories.deliveries.markDeliverySent(delivery.id);
      } catch (error) {
        await services.repositories.deliveries.markDeliveryFailed(
          delivery.id,
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  };
  const worker = createExecutorWorker({
    agentConfig: services.config.agent,
    repositories: services.repositories,
    queue: services.queue,
    workspaceLocks: services.workspaceLocks,
    cancelSignals: services.cancelSignals,
    heartbeats: services.heartbeats,
    bridge,
    notifier,
  });

  return {
    bridge,
    async detectConfigDrift() {
      return detectRuntimeFingerprintDrift(services.redis, runtimeScope, "executor", services.configFingerprint);
    },
    notifier,
    async publishFingerprint() {
      await publishRuntimeFingerprint(services.redis, runtimeScope, "executor", services.configFingerprint);
    },
    services,
    worker,
    async stop() {
      await services.redis.close();
      await services.postgres.close();
    },
  };
}

function formatRunEventMessage(chatId: string, event: RunEvent): OutboundMessage {
  switch (event.eventType) {
    case "run.started":
      return {
        chatId,
        runId: event.runId,
        kind: "status",
        content: "已开始",
      };
    case "agent.summary":
      return {
        chatId,
        runId: event.runId,
        kind: "status",
        content: String(event.payload.summary),
      };
    case "run.completed":
      return {
        chatId,
        runId: event.runId,
        kind: "result",
        content: String(event.payload.result_summary),
      };
    case "run.failed":
      return {
        chatId,
        runId: event.runId,
        kind: "error",
        content: `已失败: ${String(event.payload.failure_message)}`,
      };
    case "run.cancelled":
      return {
        chatId,
        runId: event.runId,
        kind: "status",
        content: "已取消",
      };
  }

  return {
    chatId,
    runId: event.runId,
    kind: "status",
    content: event.eventType,
  };
}
