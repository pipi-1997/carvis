import type { OutboundMessage, RepositoryBundle, RunEvent, Session } from "@carvis/core";
import type { FeishuAdapter } from "@carvis/channel-feishu";

const WORKING_REACTION_EMOJI = "OK";

type PresentationOrchestrator = {
  handleRunQueued(input: { runId: string; sessionId: string; chatId: string }): Promise<unknown>;
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

  async function sendMessage(message: OutboundMessage) {
    const delivery = await input.repositories.deliveries.createDelivery({
      runId: message.runId,
      chatId: message.chatId,
      deliveryKind: message.kind,
      content: message.content,
      now: now(),
    });

    try {
      const delivered = await input.adapter.sendMessage(message);
      await input.repositories.deliveries.markDeliverySent(delivery.id, now(), delivered.messageId);
    } catch (error) {
      await input.repositories.deliveries.markDeliveryFailed(
        delivery.id,
        error instanceof Error ? error.message : String(error),
        now(),
      );
    }
  }

  async function notifyRunEvent(session: Session, event: RunEvent) {
    const run = await input.repositories.runs.getRunById(event.runId);

    if (event.eventType === "run.queued") {
      if (run?.triggerMessageId) {
        await input.adapter.addReaction(run.triggerMessageId, WORKING_REACTION_EMOJI).catch(() => {});
      }
      await input.presentationOrchestrator?.handleRunQueued({
        runId: event.runId,
        sessionId: session.id,
        chatId: session.chatId,
      });
      return;
    }

    if (event.eventType === "run.started") {
      await input.presentationOrchestrator?.handleRunStarted({
        runId: event.runId,
        chatId: session.chatId,
        title: "运行中",
      });
      return;
    }

    if (event.eventType === "agent.output.delta") {
      await input.presentationOrchestrator?.handleOutputDelta({
        runId: event.runId,
        sequence: Number(event.payload.sequence ?? 0),
        text: String(event.payload.delta_text ?? ""),
      });
      return;
    }

    if (event.eventType === "agent.summary") {
      return;
    }

    if (run?.triggerMessageId) {
      await input.adapter.removeReaction(run.triggerMessageId, WORKING_REACTION_EMOJI).catch(() => {});
    }

    if (input.presentationOrchestrator) {
      await input.presentationOrchestrator.handleTerminalEvent({
        runId: event.runId,
        terminalEvent: {
          eventType: event.eventType,
          payload: event.payload,
        },
      });
      return;
    }

    const message = formatRunEventMessage(session.chatId, event);
    await sendMessage(message);
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
  }
}
