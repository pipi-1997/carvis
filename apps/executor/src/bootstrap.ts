import type {
  CancelSignalDriver,
  HeartbeatDriver,
  QueueDriver,
  RepositoryBundle,
  RuntimeConfig,
  WorkspaceLockDriver,
} from "@carvis/core";
import { buildRuntimeScope, createRuntimeServices, detectRuntimeFingerprintDrift, publishRuntimeFingerprint } from "@carvis/core";
import { CodexBridge, codexCliHealthcheck, createCodexCliTransport, createScriptedCodexTransport } from "@carvis/bridge-codex";
import { FeishuAdapter, createFeishuRuntimeSender } from "@carvis/channel-feishu";

import { createPresentationOrchestrator } from "../../gateway/src/services/presentation-orchestrator.ts";
import { createRunNotifier } from "../../gateway/src/services/run-notifier.ts";
import { createGatewayToolClient } from "./gateway-tool-client.ts";
import { createExecutorWorker } from "./worker.ts";

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
      transport: createCodexCliTransport({
        gatewayBaseUrl: `http://127.0.0.1:${services.config.gateway.port}`,
      }),
    });
  const adapter = new FeishuAdapter({
    signingSecret: services.config.secrets.feishuAppSecret,
    sender: createFeishuRuntimeSender({
      appId: services.config.secrets.feishuAppId,
      appSecret: services.config.secrets.feishuAppSecret,
      failCardCreate: options.env?.CARVIS_FAIL_CARD_CREATE === "1",
      failCardUpdate: options.env?.CARVIS_FAIL_CARD_UPDATE === "1",
    }),
  });
  const presentationOrchestrator = createPresentationOrchestrator({
    logger: services.logger,
    repositories: services.repositories,
    sender: adapter,
  });
  const notifier = createRunNotifier({
    adapter,
    presentationOrchestrator,
    repositories: services.repositories,
  });
  const worker = createExecutorWorker({
    agentConfig: services.config.agent,
    repositories: services.repositories,
    queue: services.queue,
    workspaceLocks: services.workspaceLocks,
    cancelSignals: services.cancelSignals,
    heartbeats: services.heartbeats,
    bridge,
    toolInvoker: createGatewayToolClient({
      baseUrl: `http://127.0.0.1:${services.config.gateway.port}`,
    }),
    logger: services.logger,
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
