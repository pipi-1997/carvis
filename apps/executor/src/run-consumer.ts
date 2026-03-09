import type { AgentConfig, RepositoryBundle, RunEvent } from "@carvis/core";
import type { QueueDriver, WorkspaceLockDriver } from "@carvis/core";

import { createRunController } from "./run-controller.ts";

export function createRunConsumer(input: {
  agentConfig: AgentConfig;
  repositories: RepositoryBundle;
  queue: QueueDriver;
  workspaceLocks: WorkspaceLockDriver;
  runController: ReturnType<typeof createRunController>;
  notifier: {
    notifyRunEvent(session: { chatId: string }, event: RunEvent): Promise<void>;
  };
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());

  return {
    async processNext(): Promise<boolean> {
      const queuedWorkspaces = input.queue.listWorkspaces();
      const workspaces = queuedWorkspaces instanceof Promise ? await queuedWorkspaces : queuedWorkspaces;

      for (const workspace of workspaces) {
        const activeRunId = input.workspaceLocks.getActiveRunId(workspace);
        if ((activeRunId instanceof Promise ? await activeRunId : activeRunId)) {
          continue;
        }

        const dequeuedRunId = input.queue.dequeue(workspace);
        const runId = dequeuedRunId instanceof Promise ? await dequeuedRunId : dequeuedRunId;
        if (!runId) {
          continue;
        }

        const run = await input.repositories.runs.getRunById(runId);
        if (!run) {
          continue;
        }

        const acquireResult = input.workspaceLocks.acquire(run.workspace, run.id);
        const locked = acquireResult instanceof Promise ? await acquireResult : acquireResult;
        if (!locked) {
          const enqueued = input.queue.enqueue(run.workspace, run.id);
          if (enqueued instanceof Promise) {
            await enqueued;
          }
          continue;
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
          const released = input.workspaceLocks.release(run.workspace, run.id);
          if (released instanceof Promise) {
            await released;
          }
        }
      }

      return false;
    },
  };
}
