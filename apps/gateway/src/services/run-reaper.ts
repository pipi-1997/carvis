import type { CancelSignalDriver, HeartbeatDriver, QueueDriver, RepositoryBundle, RunEvent, WorkspaceLockDriver } from "@carvis/core";

export function createRunReaper(input: {
  repositories: RepositoryBundle;
  heartbeats: HeartbeatDriver;
  queue: QueueDriver;
  workspaceLocks: WorkspaceLockDriver;
  notifier: {
    notifyRunEvent(session: { chatId: string }, event: RunEvent): Promise<void>;
  };
  cancelSignals?: CancelSignalDriver;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());

  return {
    async reapExpiredRuns() {
      const expiredRunIds = await input.heartbeats.findExpired(now().getTime());

      for (const runId of expiredRunIds) {
        const run = await input.repositories.runs.getRunById(runId);
        if (!run || run.status !== "running") {
          await input.heartbeats.clear(runId);
          continue;
        }

        const failedAt = now().toISOString();
        await input.repositories.runs.markRunFailed(runId, failedAt, "heartbeat_expired", "executor heartbeat expired");
        const event = await input.repositories.events.appendEvent({
          runId,
          eventType: "run.failed",
          payload: {
            run_id: runId,
            failure_code: "heartbeat_expired",
            failure_message: "executor heartbeat expired",
          },
          now: now(),
        });
        const session = await input.repositories.sessions.getSessionById(run.sessionId);
        if (session) {
          await input.notifier.notifyRunEvent(session, event);
        }
        await input.cancelSignals?.requestCancellation(runId);
        await input.heartbeats.clear(runId);
        await input.workspaceLocks.release(run.workspace, runId);
      }
    },
  };
}
