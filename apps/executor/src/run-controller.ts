import type { AgentConfig, CancelSignalDriver, HeartbeatDriver, RepositoryBundle, Run, RunEvent } from "@carvis/core";
import type { CodexBridge } from "@carvis/bridge-codex";

import { GatewayToolClientError } from "./gateway-tool-client.ts";
import { renewRunHeartbeat } from "./heartbeat.ts";

export function createRunController(input: {
  agentConfig: AgentConfig;
  repositories: RepositoryBundle;
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
    notifyRunEvent(session: { chatId: string } | null, event: RunEvent): Promise<void>;
  };
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());

  return {
    async execute(run: Run): Promise<void> {
      const session = run.sessionId
        ? await input.repositories.sessions.getSessionById(run.sessionId)
        : null;

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
            chatId: session?.chatId ?? null,
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
                if (session) {
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
                }
                break;
              }

              await input.repositories.events.appendEvent({
                runId: run.id,
                eventType: event.eventType,
                payload: event.payload,
                now: now(),
              });
              if (recoveryAttempted) {
                if (session) {
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
              if (run.triggerExecutionId) {
                const execution = await input.repositories.triggerExecutions.updateExecution({
                  executionId: run.triggerExecutionId,
                  status: "failed",
                  failureCode,
                  failureMessage,
                  finishedAt: now().toISOString(),
                  now: now(),
                });
                await input.repositories.triggerDefinitions.updateDefinitionRuntimeState({
                  definitionId: execution.definitionId,
                  lastTriggerStatus: "failed",
                  now: now(),
                });
              }
              await input.notifier.notifyRunEvent(session ? { chatId: session.chatId } : null, event);
              return;
            }

              await input.repositories.events.appendEvent({
                runId: run.id,
                eventType: event.eventType,
                payload: event.payload,
                now: now(),
              });

            if (event.eventType === "agent.summary" || event.eventType === "agent.output.delta") {
              await input.notifier.notifyRunEvent(session ?? { chatId: "" }, event);
              continue;
            }

            if (event.eventType === "agent.tool_call") {
              const toolName = String((event.payload as Record<string, unknown>).tool_name ?? "");
              const args = ((event.payload as Record<string, unknown>).arguments ?? {}) as Record<string, unknown>;
              const handledByTransport = (event.payload as Record<string, unknown>).handled_by_transport === true;
              if (handledByTransport) {
                continue;
              }
              if (!input.toolInvoker) {
                await input.repositories.runs.markRunFailed(
                  run.id,
                  now().toISOString(),
                  "tool_invoker_missing",
                  `no tool invoker for ${toolName}`,
                );
                return;
              }
              const toolResult = await input.toolInvoker.execute({
                run,
                session: session ? { chatId: session.chatId, id: session.id } : null,
                toolName,
                arguments: args,
              });
              await input.repositories.events.appendEvent({
                runId: run.id,
                eventType: "agent.tool_result",
                payload: {
                  run_id: run.id,
                  tool_name: toolName,
                  result: toolResult,
                },
                now: now(),
              });
              await handle.submitToolResult({
                toolName,
                result: toolResult,
              });
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
              const currentBinding = session
                ? await input.repositories.conversationSessionBindings.getBindingBySessionId(session.id)
                : null;
              const resetAfterRunCreated =
                currentBinding?.status === "reset"
                && typeof currentBinding.lastResetAt === "string"
                && currentBinding.lastResetAt > run.createdAt;
              if (session && resolvedBridgeSessionId && !resetAfterRunCreated) {
                await input.repositories.conversationSessionBindings.saveBindingContinuation({
                  session,
                  bridge: input.agentConfig.bridge,
                  bridgeSessionId: resolvedBridgeSessionId,
                  workspace: run.workspace,
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
              if (run.triggerExecutionId) {
                const execution = await input.repositories.triggerExecutions.updateExecution({
                  executionId: run.triggerExecutionId,
                  status: "completed",
                  finishedAt: now().toISOString(),
                  now: now(),
                });
                await input.repositories.triggerDefinitions.updateDefinitionRuntimeState({
                  definitionId: execution.definitionId,
                  lastTriggerStatus: "completed",
                  now: now(),
                });
              }
              await input.notifier.notifyRunEvent(session ? { chatId: session.chatId } : null, event);
              return;
            }

            if (event.eventType === "run.cancelled") {
              await input.repositories.runs.markRunCancelled(
                run.id,
                now().toISOString(),
                String(event.payload.reason ?? "cancel requested"),
              );
              if (run.triggerExecutionId) {
                const execution = await input.repositories.triggerExecutions.updateExecution({
                  executionId: run.triggerExecutionId,
                  status: "cancelled",
                  failureCode: "cancelled",
                  failureMessage: String(event.payload.reason ?? "cancel requested"),
                  finishedAt: now().toISOString(),
                  now: now(),
                });
                await input.repositories.triggerDefinitions.updateDefinitionRuntimeState({
                  definitionId: execution.definitionId,
                  lastTriggerStatus: "cancelled",
                  now: now(),
                });
              }
              await input.notifier.notifyRunEvent(session ? { chatId: session.chatId } : null, event);
              return;
            }
          }

          if (!shouldRetryFresh) {
            return;
          }
        }
      } catch (error) {
        const failureMessage = error instanceof Error ? error.message : String(error);
        const failureCode = error instanceof GatewayToolClientError
          ? error.failureCode
          : "bridge_error";
        if (recoveryAttempted) {
          if (session) {
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
        }
        const failedEvent = await input.repositories.events.appendEvent({
          runId: run.id,
          eventType: "run.failed",
          payload: {
            run_id: run.id,
            failure_code: failureCode,
            failure_message: failureMessage,
          },
          now: now(),
        });
        await input.repositories.runs.markRunFailed(run.id, now().toISOString(), failureCode, failureMessage, {
          sessionRecoveryAttempted: recoveryAttempted,
          sessionRecoveryResult: recoveryAttempted ? "failed" : null,
        });
        if (run.triggerExecutionId) {
          const execution = await input.repositories.triggerExecutions.updateExecution({
            executionId: run.triggerExecutionId,
            status: "failed",
            failureCode,
            failureMessage,
            finishedAt: now().toISOString(),
            now: now(),
          });
          await input.repositories.triggerDefinitions.updateDefinitionRuntimeState({
            definitionId: execution.definitionId,
            lastTriggerStatus: "failed",
            now: now(),
          });
        }
        await input.notifier.notifyRunEvent(session ? { chatId: session.chatId } : null, failedEvent);
      } finally {
        void cancelWatcher;
        await input.heartbeats.clear(run.id);
        await input.cancelSignals.clear(run.id);
      }
    },
  };
}
