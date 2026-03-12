import type {
  AgentConfig,
  CancelSignalDriver,
  HeartbeatDriver,
  QueueDriver,
  RepositoryBundle,
  Run,
  WorkspaceLockDriver,
} from "@carvis/core";
import type { CodexBridge } from "@carvis/bridge-codex";

import { createRunConsumer } from "./run-consumer.ts";
import { createRunController } from "./run-controller.ts";

export function createExecutorWorker(input: {
  agentConfig: AgentConfig;
  repositories: RepositoryBundle;
  queue: QueueDriver;
  workspaceLocks: WorkspaceLockDriver;
  cancelSignals: CancelSignalDriver;
  heartbeats: HeartbeatDriver;
  bridge: CodexBridge;
  toolInvoker?: {
    execute(input: {
      run: Run;
      session: { chatId: string; id: string } | null;
      toolName: string;
      arguments: Record<string, unknown>;
    }): Promise<Record<string, unknown>>;
  };
  logger?: ReturnType<typeof import("@carvis/core").createRuntimeLogger>;
  notifier: {
    notifyRunEvent(session: { chatId: string }, event: { eventType: string; payload: Record<string, unknown>; runId: string }): Promise<void>;
  };
  now?: () => Date;
}) {
  const runController = createRunController({
    agentConfig: input.agentConfig,
    repositories: input.repositories,
    cancelSignals: input.cancelSignals,
    heartbeats: input.heartbeats,
    bridge: input.bridge,
    toolInvoker: input.toolInvoker,
    logger: input.logger,
    notifier: input.notifier,
    now: input.now,
  });
  const consumer = createRunConsumer({
    agentConfig: input.agentConfig,
    cancelSignals: input.cancelSignals,
    repositories: input.repositories,
    queue: input.queue,
    workspaceLocks: input.workspaceLocks,
    runController,
    notifier: input.notifier,
    now: input.now,
  });

  return {
    processNext: consumer.processNext,
  };
}
