import type { RepositoryBundle, RunEvent, RunStatus } from "@carvis/core";

import { formatTerminalResultMessage, renderTerminalResultDocument } from "./terminal-result-renderer.ts";
import { createRunOutputWindow } from "./run-output-window.ts";

type PresentationSender = {
  completeCard(input: {
    body: string;
    cardId: string;
    elementId: string;
    runId: string;
    status: "completed" | "failed" | "cancelled";
    title: string;
  }): Promise<void>;
  createCard(input: { chatId: string; runId: string; title: string; body: string }): Promise<{
    messageId: string;
    cardId: string;
    elementId: string;
  }>;
  updateCard(input: { cardId: string; elementId: string; runId: string; text: string }): Promise<void>;
  sendFallbackTerminal(input: {
    chatId: string;
    runId: string;
    title: string;
    content: string;
  }): Promise<{ messageId: string }>;
};

export function createPresentationOrchestrator(input: {
  logger?: {
    error(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
  };
  now?: () => Date;
  repositories: RepositoryBundle;
  sender: PresentationSender;
}) {
  const now = input.now ?? (() => new Date());
  const outputWindows = new Map<string, ReturnType<typeof createRunOutputWindow>>();

  return {
    async handleRunQueued(event: { runId: string; sessionId: string; chatId: string }) {
      return input.repositories.presentations.createPendingPresentation({
        runId: event.runId,
        sessionId: event.sessionId,
        chatId: event.chatId,
      });
    },
    async handleRunStarted(event: { runId: string; chatId: string; title: string }) {
      let existing = await input.repositories.presentations.getPresentationByRunId(event.runId);
      if (!existing) {
        const run = await input.repositories.runs.getRunById(event.runId);
        if (!run) {
          throw new Error(`run not found: ${event.runId}`);
        }
        const session = await input.repositories.sessions.getSessionById(run.sessionId);
        if (!session) {
          throw new Error(`session not found: ${run.sessionId}`);
        }
        existing = await input.repositories.presentations.createPendingPresentation({
          runId: event.runId,
          sessionId: run.sessionId,
          chatId: session.chatId,
          now: now(),
        });
      }

      const delivery = await input.repositories.deliveries.createDelivery({
        runId: event.runId,
        chatId: event.chatId,
        deliveryKind: "card_create",
        content: "正在处理",
        now: now(),
      });
      let created: { messageId: string; cardId: string; elementId: string };
      try {
        created = await input.sender.createCard({
          chatId: event.chatId,
          runId: event.runId,
          title: event.title,
          body: "正在处理",
        });
      } catch (error) {
        await input.repositories.deliveries.markDeliveryFailed(
          delivery.id,
          error instanceof Error ? error.message : String(error),
          now(),
        );
        return markPresentationDegraded(event.runId, error);
      }

      await input.repositories.deliveries.markDeliverySent(
        delivery.id,
        now(),
        created.messageId,
      );
      outputWindows.set(event.runId, createRunOutputWindow());
      input.logger?.info("presentation.card_create.sent", {
        cardId: created.cardId,
        messageId: created.messageId,
        runId: event.runId,
      });

      return input.repositories.presentations.markPresentationStreaming({
        runId: event.runId,
        streamingMessageId: created.messageId,
        streamingCardId: created.cardId,
        streamingElementId: created.elementId,
      });
    },
    async handleOutputDelta(event: { runId: string; sequence: number; text: string }) {
      const presentation = await input.repositories.presentations.getPresentationByRunId(event.runId);
      if (!presentation || presentation.phase === "degraded") {
        return null;
      }
      if (!presentation.streamingCardId || !presentation.streamingElementId) {
        return null;
      }

      const window = outputWindows.get(event.runId) ?? createRunOutputWindow();
      outputWindows.set(event.runId, window);
      const state = window.appendDelta({
        sequence: event.sequence,
        text: event.text,
      });
      if (!state) {
        return null;
      }

      const delivery = await input.repositories.deliveries.createDelivery({
        runId: event.runId,
        chatId: presentation.chatId,
        deliveryKind: "card_update",
        content: state.visibleText,
        targetRef: presentation.streamingCardId,
        now: now(),
      });
      try {
        await input.sender.updateCard({
          cardId: presentation.streamingCardId,
          elementId: presentation.streamingElementId,
          runId: event.runId,
          text: state.visibleText,
        });
      } catch (error) {
        await input.repositories.deliveries.markDeliveryFailed(
          delivery.id,
          error instanceof Error ? error.message : String(error),
          now(),
        );
        return markPresentationDegraded(event.runId, error);
      }

      await input.repositories.deliveries.markDeliverySent(
        delivery.id,
        now(),
        presentation.streamingCardId,
      );
      input.logger?.info("presentation.card_update.sent", {
        cardId: presentation.streamingCardId,
        runId: event.runId,
        sequence: state.lastRenderedSequence ?? event.sequence,
      });

      return input.repositories.presentations.updatePresentationOutput({
        runId: event.runId,
        lastOutputSequence: state.lastRenderedSequence ?? event.sequence,
        lastOutputExcerpt: state.excerpt ?? "",
      });
    },
    async handleTerminalEvent(event: {
      runId: string;
      terminalEvent: Pick<RunEvent, "eventType" | "payload">;
    }) {
      const run = await input.repositories.runs.getRunById(event.runId);
      const presentation = await input.repositories.presentations.getPresentationByRunId(event.runId);
      if (!run || !presentation) {
        return null;
      }

      const terminalStatus = resolveTerminalStatus(event.terminalEvent.eventType);
      const terminalDocument = renderTerminalResultDocument({
        lastOutputExcerpt: presentation.lastOutputExcerpt,
        run,
        terminalEvent: event.terminalEvent,
      });
      const terminalMessage = formatTerminalResultMessage(terminalDocument);

      if (presentation.streamingCardId && presentation.streamingElementId) {
        const cardDelivery = await input.repositories.deliveries.createDelivery({
          runId: event.runId,
          chatId: presentation.chatId,
          deliveryKind: "card_complete",
          content: terminalMessage.content,
          targetRef: presentation.streamingCardId,
          now: now(),
        });
        try {
          await input.sender.completeCard({
            cardId: presentation.streamingCardId,
            elementId: presentation.streamingElementId,
            runId: event.runId,
            status: terminalStatus,
            title: terminalMessage.title,
            body: terminalMessage.content,
          });
          await input.repositories.deliveries.markDeliverySent(
            cardDelivery.id,
            now(),
            presentation.streamingCardId,
          );
          await input.repositories.presentations.markPresentationTerminal({
            runId: event.runId,
            phase: terminalStatus,
            terminalStatus,
            lastOutputExcerpt: presentation.lastOutputExcerpt,
            lastOutputSequence: presentation.lastOutputSequence,
            now: now(),
          });
          input.logger?.info("presentation.card_complete.sent", {
            cardId: presentation.streamingCardId,
            runId: event.runId,
            status: terminalStatus,
          });
        } catch (error) {
          await input.repositories.deliveries.markDeliveryFailed(
            cardDelivery.id,
            error instanceof Error ? error.message : String(error),
            now(),
          );
          await markPresentationDegraded(event.runId, error);
        }
      }

      const nextPresentation = await input.repositories.presentations.getPresentationByRunId(event.runId);
      const shouldSendFallback = !nextPresentation?.streamingMessageId;
      if (!shouldSendFallback) {
        return nextPresentation;
      }

      const fallbackDocument =
        nextPresentation && nextPresentation.lastOutputExcerpt !== presentation.lastOutputExcerpt
          ? renderTerminalResultDocument({
              lastOutputExcerpt: nextPresentation.lastOutputExcerpt,
              run,
              terminalEvent: event.terminalEvent,
            })
          : terminalDocument;
      const fallbackMessage = formatTerminalResultMessage(fallbackDocument);
      const fallbackDelivery = await input.repositories.deliveries.createDelivery({
        runId: event.runId,
        chatId: presentation.chatId,
        deliveryKind: "fallback_terminal",
        content: fallbackMessage.content,
        now: now(),
      });

      try {
        const delivered = await input.sender.sendFallbackTerminal({
          chatId: presentation.chatId,
          runId: event.runId,
          title: fallbackMessage.title,
          content: fallbackMessage.content,
        });
        await input.repositories.deliveries.markDeliverySent(
          fallbackDelivery.id,
          now(),
          delivered.messageId,
        );
        await input.repositories.presentations.attachFallbackTerminal({
          runId: event.runId,
          fallbackTerminalMessageId: delivered.messageId,
          now: now(),
        });
        input.logger?.info("presentation.fallback_terminal.sent", {
          messageId: delivered.messageId,
          runId: event.runId,
          status: terminalStatus,
        });
      } catch (error) {
        await input.repositories.deliveries.markDeliveryFailed(
          fallbackDelivery.id,
          error instanceof Error ? error.message : String(error),
          now(),
        );
        input.logger?.error("presentation.fallback_terminal.failed", {
          error: error instanceof Error ? error.message : String(error),
          runId: event.runId,
          status: terminalStatus,
        });
      }

      return input.repositories.presentations.getPresentationByRunId(event.runId);
    },
  };

  async function markPresentationDegraded(runId: string, error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    input.logger?.warn("presentation.degraded", {
      reason,
      runId,
    });
    return input.repositories.presentations.markPresentationDegraded({
      runId,
      degradedReason: reason,
      now: now(),
    });
  }
}

function resolveTerminalStatus(eventType: RunEvent["eventType"]): Extract<RunStatus, "completed" | "failed" | "cancelled"> {
  if (eventType === "run.completed") {
    return "completed";
  }
  if (eventType === "run.failed") {
    return "failed";
  }
  return "cancelled";
}
