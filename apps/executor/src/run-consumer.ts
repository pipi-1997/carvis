import type { AgentConfig, RepositoryBundle, RunEvent } from "@carvis/core";
import type { RunQueue, WorkspaceLockManager } from "@carvis/core";

import { createRunController } from "./run-controller.ts";

export function createRunConsumer(input: {
  agentConfig: AgentConfig;
  repositories: RepositoryBundle;
  queue: RunQueue;
  workspaceLocks: WorkspaceLockManager;
  runController: ReturnType<typeof createRunController>;
  notifier: {
    notifyRunEvent(session: { chatId: string }, event: RunEvent): Promise<void>;
  };
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());

  return {
    async processNext(): Promise<boolean> {
      if (input.workspaceLocks.getActiveRunId(input.agentConfig.workspace)) {
        return false;
      }

      const runId = input.queue.dequeue(input.agentConfig.workspace);
      if (!runId) {
        return false;
      }

      const run = await input.repositories.runs.getRunById(runId);
      if (!run) {
        return false;
      }

      const locked = input.workspaceLocks.acquire(run.workspace, run.id);
      if (!locked) {
        input.queue.enqueue(run.workspace, run.id);
        return false;
      }

      try {
        const session = await input.repositories.sessions.getSessionById(run.sessionId);
        if (!session) {
          throw new Error(`session not found: ${run.sessionId}`);
        }

        await input.repositories.runs.markRunStarted(run.id, now().toISOString());
        const startedEvent = await input.repositories.events.appendEvent({
          runId: run.id,
          eventType: "run.started",
          payload: {
            run_id: run.id,
            workspace: run.workspace,
            started_at: now().toISOString(),
          },
          now: now(),
        });
        await input.notifier.notifyRunEvent(session, startedEvent);
        await input.runController.execute(run);
        return true;
      } finally {
        input.workspaceLocks.release(run.workspace, run.id);
      }
    },
  };
}
