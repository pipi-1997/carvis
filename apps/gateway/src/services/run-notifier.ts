import type { OutboundMessage, RepositoryBundle, Run, RunEvent, Session } from "@carvis/core";
import type { FeishuAdapter } from "@carvis/channel-feishu";

const WORKING_REACTION_EMOJI = "OK";

type PresentationOrchestrator = {
  handleRunQueued(input: { runId: string; sessionId: string | null; chatId: string }): Promise<unknown>;
  handleRunStarted(input: { runId: string; chatId: string; title: string }): Promise<unknown>;
  handleOutputDelta(input: { runId: string; sequence: number; text: string }): Promise<unknown>;
  handleTerminalEvent(input: { runId: string; terminalEvent: Pick<RunEvent, "eventType" | "payload"> }): Promise<unknown>;
};

export function createRunNotifier(input: {
  adapter: FeishuAdapter;
  presentationOrchestrator?: PresentationOrchestrator;
  repositories: RepositoryBundle;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());

  async function sendDelivery(inputMessage: OutboundMessage, run?: Run | null) {
    const delivery = await input.repositories.deliveries.createDelivery({
      runId: inputMessage.runId,
      triggerExecutionId: run?.triggerExecutionId ?? null,
      chatId: inputMessage.chatId,
      deliveryKind: inputMessage.kind,
      content: inputMessage.content,
      now: now(),
    });

    try {
      const delivered = await input.adapter.sendMessage(inputMessage);
      await input.repositories.deliveries.markDeliverySent(delivery.id, now(), delivered.messageId);
      if (run?.triggerExecutionId) {
        await input.repositories.triggerExecutions.updateExecution({
          executionId: run.triggerExecutionId,
          deliveryStatus: "sent",
          now: now(),
        });
      }
    } catch (error) {
      await input.repositories.deliveries.markDeliveryFailed(
        delivery.id,
        error instanceof Error ? error.message : String(error),
        now(),
      );
      if (run?.triggerExecutionId) {
        await input.repositories.triggerExecutions.updateExecution({
          executionId: run.triggerExecutionId,
          deliveryStatus: "failed",
          now: now(),
        });
      }
    }
  }

  async function sendMessage(message: OutboundMessage) {
    await sendDelivery(message, message.runId ? await input.repositories.runs.getRunById(message.runId) : null);
  }

  async function notifyRunEvent(session: Session | { chatId: string } | null, event: RunEvent) {
    const run = await input.repositories.runs.getRunById(event.runId);
    const isChatTriggered = run?.triggerSource === "chat_message" && !!run.sessionId;
    const hasFeishuDeliveryTarget = run?.deliveryTarget?.kind === "feishu_chat" && !!run.deliveryTarget.chatId;
    const isFeishuScheduledTrigger = run?.triggerSource === "scheduled_job" && hasFeishuDeliveryTarget;
    const shouldUseInteractivePresentation =
      isChatTriggered || run?.triggerSource === "external_webhook" || isFeishuScheduledTrigger;
    const persistedSession =
      !session && run?.sessionId ? await input.repositories.sessions.getSessionById(run.sessionId) : null;
    const chatId = session?.chatId || persistedSession?.chatId || null;
    const presentationChatId = hasFeishuDeliveryTarget ? run?.deliveryTarget?.chatId ?? null : chatId;

    if (event.eventType === "run.queued") {
      if (isChatTriggered && run?.triggerMessageId) {
        await input.adapter.addReaction(run.triggerMessageId, WORKING_REACTION_EMOJI).catch(() => {});
      }
      const presentationSession =
        session && "id" in session ? session : persistedSession;
      if (shouldUseInteractivePresentation) {
        if (presentationSession) {
          await input.presentationOrchestrator?.handleRunQueued({
            runId: event.runId,
            sessionId: presentationSession.id,
            chatId: presentationSession.chatId,
          });
        } else if (presentationChatId) {
          await input.presentationOrchestrator?.handleRunQueued({
            runId: event.runId,
            sessionId: null,
            chatId: presentationChatId,
          });
        }
      }
      return;
    }

    if (event.eventType === "run.started") {
      if (shouldUseInteractivePresentation && (presentationChatId || chatId)) {
        await input.presentationOrchestrator?.handleRunStarted({
          runId: event.runId,
          chatId: presentationChatId ?? chatId ?? "",
          title: "运行中",
        });
      }
      return;
    }

    if (event.eventType === "agent.output.delta") {
      if (shouldUseInteractivePresentation) {
        await input.presentationOrchestrator?.handleOutputDelta({
          runId: event.runId,
          sequence: Number(event.payload.sequence ?? 0),
          text: String(event.payload.delta_text ?? ""),
        });
      }
      return;
    }

    if (event.eventType === "agent.summary") {
      return;
    }

    if (isChatTriggered && run?.triggerMessageId) {
      await input.adapter.removeReaction(run.triggerMessageId, WORKING_REACTION_EMOJI).catch(() => {});
    }

    if (shouldUseInteractivePresentation && input.presentationOrchestrator) {
      await input.presentationOrchestrator.handleTerminalEvent({
        runId: event.runId,
        terminalEvent: {
          eventType: event.eventType,
          payload: event.payload,
        },
      });
      return;
    }

    const targetChatId = run?.deliveryTarget?.kind === "feishu_chat"
      ? run.deliveryTarget.chatId ?? null
      : chatId;
    if (!targetChatId) {
      return;
    }

    const message = formatRunEventMessage(targetChatId, event);
    await sendDelivery(message, run);
  }

  return {
    notifyRunEvent,
    sendMessage,
  };
}

function formatRunEventMessage(chatId: string, event: RunEvent): OutboundMessage {
  switch (event.eventType) {
    case "run.queued":
      return {
        chatId,
        runId: event.runId,
        kind: "status",
        content: `已排队，前方队列长度: ${Number(event.payload.queue_position ?? 0)}`,
      };
    case "run.started":
      return {
        chatId,
        runId: event.runId,
        kind: "status",
        content: "已开始",
      };
    case "agent.summary":
      return {
        chatId,
        runId: event.runId,
        kind: "status",
        content: String(event.payload.summary),
      };
    case "agent.output.delta":
      return {
        chatId,
        runId: event.runId,
        kind: "status",
        content: String(event.payload.delta_text ?? ""),
      };
    case "agent.tool_call":
      return {
        chatId,
        runId: event.runId,
        kind: "status",
        content: `正在执行工具 ${String(event.payload.tool_name ?? "unknown")}`,
      };
    case "agent.tool_result":
      return {
        chatId,
        runId: event.runId,
        kind: "status",
        content: String((event.payload.result as { summary?: string } | undefined)?.summary ?? "工具执行完成"),
      };
    case "run.completed":
      return {
        chatId,
        runId: event.runId,
        kind: "result",
        content: String(event.payload.result_summary),
      };
    case "run.failed":
      return {
        chatId,
        runId: event.runId,
        kind: "error",
        content: `已失败: ${String(event.payload.failure_message)}`,
      };
    case "run.cancelled":
      return {
        chatId,
        runId: event.runId,
        kind: "status",
        content: "已取消",
      };
    default:
      return {
        chatId,
        runId: event.runId,
        kind: "status",
        content: "",
      };
  }
}
