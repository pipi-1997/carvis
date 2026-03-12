import type { AgentConfig, CancelSignalDriver, RepositoryBundle, RunEvent } from "@carvis/core";
import type { QueueDriver, WorkspaceLockDriver } from "@carvis/core";

import { createRunController } from "./run-controller.ts";

export function createRunConsumer(input: {
  agentConfig: AgentConfig;
  repositories: RepositoryBundle;
  cancelSignals: CancelSignalDriver;
  queue: QueueDriver;
  workspaceLocks: WorkspaceLockDriver;
  runController: ReturnType<typeof createRunController>;
  notifier: {
    notifyRunEvent(session: { chatId: string } | null, event: RunEvent): Promise<void>;
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
          const session = run.sessionId
            ? await input.repositories.sessions.getSessionById(run.sessionId)
            : null;

          await input.repositories.runs.markRunStarted(run.id, now().toISOString());
          if (run.triggerExecutionId) {
            const execution = await input.repositories.triggerExecutions.updateExecution({
              executionId: run.triggerExecutionId,
              status: "running",
              runId: run.id,
              now: now(),
            });
            await input.repositories.triggerDefinitions.updateDefinitionRuntimeState({
              definitionId: execution.definitionId,
              lastTriggerStatus: "running",
              now: now(),
            });
          }
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
          await input.notifier.notifyRunEvent(session ? { chatId: session.chatId } : null, startedEvent);
          if (await input.cancelSignals.isCancellationRequested(run.id)) {
            const cancelledEvent = await input.repositories.events.appendEvent({
              runId: run.id,
              eventType: "run.cancelled",
              payload: {
                run_id: run.id,
                cancelled_at: now().toISOString(),
                reason: "cancel requested",
              },
              now: now(),
            });
            await input.repositories.runs.markRunCancelled(
              run.id,
              now().toISOString(),
              "cancel requested",
            );
            if (run.triggerExecutionId) {
              const execution = await input.repositories.triggerExecutions.updateExecution({
                executionId: run.triggerExecutionId,
                status: "cancelled",
                failureCode: "cancelled",
                failureMessage: "cancel requested",
                finishedAt: now().toISOString(),
                now: now(),
              });
              await input.repositories.triggerDefinitions.updateDefinitionRuntimeState({
                definitionId: execution.definitionId,
                lastTriggerStatus: "cancelled",
                now: now(),
              });
            }
            await input.notifier.notifyRunEvent(session ? { chatId: session.chatId } : null, cancelledEvent);
            return true;
          }
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
