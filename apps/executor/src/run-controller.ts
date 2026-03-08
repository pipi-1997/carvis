import type { AgentConfig, CancelSignalDriver, HeartbeatDriver, RepositoryBundle, Run, RunEvent } from "@carvis/core";
import type { CodexBridge } from "@carvis/bridge-codex";

import { renewRunHeartbeat } from "./heartbeat.ts";

export function createRunController(input: {
  agentConfig: AgentConfig;
  repositories: RepositoryBundle;
  cancelSignals: CancelSignalDriver;
  heartbeats: HeartbeatDriver;
  bridge: CodexBridge;
  notifier: {
    notifyRunEvent(session: { chatId: string }, event: RunEvent): Promise<void>;
  };
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());

  return {
    async execute(run: Run): Promise<void> {
      const session = await input.repositories.sessions.getSessionById(run.sessionId);
      if (!session) {
        throw new Error(`session not found: ${run.sessionId}`);
      }

      await renewRunHeartbeat(input.heartbeats, run.id, now().getTime());

      const handle = await input.bridge.startRun({
        id: run.id,
        sessionId: run.sessionId,
        agentId: run.agentId,
        workspace: run.workspace,
        prompt: run.prompt,
        triggerMessageId: run.triggerMessageId,
        triggerUserId: run.triggerUserId,
        timeoutSeconds: run.timeoutSeconds,
        createdAt: run.createdAt,
      });

      const cancelWatcher = input.cancelSignals.waitForCancellation(run.id).then(async () => {
        await input.bridge.cancelRun(run.id);
      });

      try {
        for await (const event of handle.streamEvents()) {
          await renewRunHeartbeat(input.heartbeats, run.id, now().getTime());
          const current = await input.repositories.runs.getRunById(run.id);
          if (!current || current.status === "failed" || current.status === "completed" || current.status === "cancelled") {
            continue;
          }

          await input.repositories.events.appendEvent({
            runId: run.id,
            eventType: event.eventType,
            payload: event.payload,
            now: now(),
          });

          if (event.eventType === "agent.summary") {
            await input.notifier.notifyRunEvent(session, event);
            continue;
          }

          if (event.eventType === "run.completed") {
            await input.repositories.runs.markRunCompleted(
              run.id,
              now().toISOString(),
              String(event.payload.result_summary ?? "completed"),
            );
            await input.notifier.notifyRunEvent(session, event);
            continue;
          }

          if (event.eventType === "run.failed") {
            await input.repositories.runs.markRunFailed(
              run.id,
              now().toISOString(),
              String(event.payload.failure_code ?? "run_failed"),
              String(event.payload.failure_message ?? "run failed"),
            );
            await input.notifier.notifyRunEvent(session, event);
            continue;
          }

          if (event.eventType === "run.cancelled") {
            await input.repositories.runs.markRunCancelled(
              run.id,
              now().toISOString(),
              String(event.payload.reason ?? "cancel requested"),
            );
            await input.notifier.notifyRunEvent(session, event);
          }
        }
      } catch (error) {
        const failureMessage = error instanceof Error ? error.message : String(error);
        const failedEvent = await input.repositories.events.appendEvent({
          runId: run.id,
          eventType: "run.failed",
          payload: {
            run_id: run.id,
            failure_code: "bridge_error",
            failure_message: failureMessage,
          },
          now: now(),
        });
        await input.repositories.runs.markRunFailed(run.id, now().toISOString(), "bridge_error", failureMessage);
        await input.notifier.notifyRunEvent(session, failedEvent);
      } finally {
        void cancelWatcher;
        await input.heartbeats.clear(run.id);
        await input.cancelSignals.clear(run.id);
      }
    },
  };
}
