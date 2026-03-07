import type { AgentConfig, RepositoryBundle } from "@carvis/core";
import type { CancelSignalStore, HeartbeatMonitor, RunQueue, WorkspaceLockManager } from "@carvis/core";
import type { CodexBridge } from "@carvis/bridge-codex";

import { createRunConsumer } from "./run-consumer.ts";
import { createRunController } from "./run-controller.ts";

export function createExecutorWorker(input: {
  agentConfig: AgentConfig;
  repositories: RepositoryBundle;
  queue: RunQueue;
  workspaceLocks: WorkspaceLockManager;
  cancelSignals: CancelSignalStore;
  heartbeats: HeartbeatMonitor;
  bridge: CodexBridge;
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
    notifier: input.notifier,
    now: input.now,
  });
  const consumer = createRunConsumer({
    agentConfig: input.agentConfig,
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
