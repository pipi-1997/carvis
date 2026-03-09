import type { AgentConfig, CancelSignalDriver, HeartbeatDriver, RepositoryBundle, Run, RunEvent } from "@carvis/core";
import type { CodexBridge } from "@carvis/bridge-codex";

import { renewRunHeartbeat } from "./heartbeat.ts";

export function createRunController(input: {
  agentConfig: AgentConfig;
  repositories: RepositoryBundle;
  cancelSignals: CancelSignalDriver;
  heartbeats: HeartbeatDriver;
  bridge: CodexBridge;
  logger?: ReturnType<typeof import("@carvis/core").createRuntimeLogger>;
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
      let requestSessionMode = run.requestedSessionMode;
      let requestBridgeSessionId = run.requestedBridgeSessionId;
      let recoveryAttempted = false;

      const cancelWatcher = input.cancelSignals.waitForCancellation(run.id).then(async () => {
        await input.bridge.cancelRun(run.id);
      });

      try {
        while (true) {
          const handle = await input.bridge.startRun({
            id: run.id,
            sessionId: run.sessionId,
            agentId: run.agentId,
            workspace: run.workspace,
            prompt: run.prompt,
            triggerMessageId: run.triggerMessageId,
            triggerUserId: run.triggerUserId,
            timeoutSeconds: run.timeoutSeconds,
            bridgeSessionId: requestBridgeSessionId,
            sessionMode: requestSessionMode,
            createdAt: run.createdAt,
          });
          let shouldRetryFresh = false;

          for await (const event of handle.streamEvents()) {
            await renewRunHeartbeat(input.heartbeats, run.id, now().getTime());
            const current = await input.repositories.runs.getRunById(run.id);
            if (!current || current.status === "failed" || current.status === "completed" || current.status === "cancelled") {
              continue;
            }

            if (event.eventType === "run.failed") {
              const failureCode = String(event.payload.failure_code ?? "run_failed");
              const failureMessage = String(event.payload.failure_message ?? "run failed");
              const sessionInvalid = event.payload.session_invalid === true;

              if (sessionInvalid && requestSessionMode === "continuation" && !recoveryAttempted) {
                recoveryAttempted = true;
                shouldRetryFresh = true;
                requestSessionMode = "fresh";
                requestBridgeSessionId = null;
                await input.repositories.conversationSessionBindings.markBindingInvalidated({
                  session,
                  reason: failureMessage,
                  now: now(),
                });
                input.logger?.continuationBindingState("invalidated", {
                  agentId: input.agentConfig.id,
                  chatId: session.chatId,
                  sessionId: session.id,
                  runId: run.id,
                  reason: failureMessage,
                });
                break;
              }

              await input.repositories.events.appendEvent({
                runId: run.id,
                eventType: event.eventType,
                payload: event.payload,
                now: now(),
              });
              if (recoveryAttempted) {
                await input.repositories.conversationSessionBindings.markBindingInvalidated({
                  session,
                  reason: failureMessage,
                  recoveryResult: "failed",
                  now: now(),
                });
                input.logger?.continuationBindingState("recovery_failed", {
                  agentId: input.agentConfig.id,
                  chatId: session.chatId,
                  sessionId: session.id,
                  runId: run.id,
                  reason: failureMessage,
                  recoveryResult: "failed",
                });
              }
              await input.repositories.runs.markRunFailed(
                run.id,
                now().toISOString(),
                failureCode,
                failureMessage,
                {
                  sessionRecoveryAttempted: recoveryAttempted,
                  sessionRecoveryResult: recoveryAttempted ? "failed" : null,
                },
              );
              await input.notifier.notifyRunEvent(session, event);
              return;
            }

            await input.repositories.events.appendEvent({
              runId: run.id,
              eventType: event.eventType,
              payload: event.payload,
              now: now(),
            });

            if (event.eventType === "agent.summary" || event.eventType === "agent.output.delta") {
              await input.notifier.notifyRunEvent(session, event);
              continue;
            }

            if (event.eventType === "run.completed") {
              const resolvedBridgeSessionId =
                typeof event.payload.bridge_session_id === "string" ? event.payload.bridge_session_id : null;
              const silentContinuationRecovery =
                requestSessionMode === "continuation"
                && !!requestBridgeSessionId
                && !!resolvedBridgeSessionId
                && resolvedBridgeSessionId !== requestBridgeSessionId;
              const recovered = recoveryAttempted || silentContinuationRecovery;
              const currentBinding = await input.repositories.conversationSessionBindings.getBindingBySessionId(session.id);
              const resetAfterRunCreated =
                currentBinding?.status === "reset"
                && typeof currentBinding.lastResetAt === "string"
                && currentBinding.lastResetAt > run.createdAt;
              if (resolvedBridgeSessionId && !resetAfterRunCreated) {
                await input.repositories.conversationSessionBindings.saveBindingContinuation({
                  session,
                  bridge: input.agentConfig.bridge,
                  bridgeSessionId: resolvedBridgeSessionId,
                  status: recovered ? "recovered" : "bound",
                  recoveryResult: recovered ? "recovered" : null,
                  now: now(),
                });
                input.logger?.continuationBindingState(recovered ? "recovered" : "bound", {
                  agentId: input.agentConfig.id,
                  chatId: session.chatId,
                  sessionId: session.id,
                  runId: run.id,
                  bridgeSessionId: resolvedBridgeSessionId,
                  recoveryResult: recovered ? "recovered" : null,
                });
              }
              await input.repositories.runs.markRunCompleted(
                run.id,
                now().toISOString(),
                String(event.payload.result_summary ?? "completed"),
                {
                  resolvedBridgeSessionId,
                  sessionRecoveryAttempted: recovered,
                  sessionRecoveryResult: recovered ? "recovered" : null,
                },
              );
              await input.notifier.notifyRunEvent(session, event);
              return;
            }

            if (event.eventType === "run.cancelled") {
              await input.repositories.runs.markRunCancelled(
                run.id,
                now().toISOString(),
                String(event.payload.reason ?? "cancel requested"),
              );
              await input.notifier.notifyRunEvent(session, event);
              return;
            }
          }

          if (!shouldRetryFresh) {
            return;
          }
        }
      } catch (error) {
        const failureMessage = error instanceof Error ? error.message : String(error);
        if (recoveryAttempted) {
          await input.repositories.conversationSessionBindings.markBindingInvalidated({
            session,
            reason: failureMessage,
            recoveryResult: "failed",
            now: now(),
          });
          input.logger?.continuationBindingState("recovery_failed", {
            agentId: input.agentConfig.id,
            chatId: session.chatId,
            sessionId: session.id,
            runId: run.id,
            reason: failureMessage,
            recoveryResult: "failed",
          });
        }
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
        await input.repositories.runs.markRunFailed(run.id, now().toISOString(), "bridge_error", failureMessage, {
          sessionRecoveryAttempted: recoveryAttempted,
          sessionRecoveryResult: recoveryAttempted ? "failed" : null,
        });
        await input.notifier.notifyRunEvent(session, failedEvent);
      } finally {
        void cancelWatcher;
        await input.heartbeats.clear(run.id);
        await input.cancelSignals.clear(run.id);
      }
    },
  };
}
