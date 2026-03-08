import type { OutboundMessage, RepositoryBundle, RunEvent, Session } from "@carvis/core";
import type { FeishuAdapter } from "@carvis/channel-feishu";

const WORKING_REACTION_EMOJI = "OK";

export function createRunNotifier(input: {
  adapter: FeishuAdapter;
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
      await input.adapter.sendMessage(message);
      await input.repositories.deliveries.markDeliverySent(delivery.id, now());
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
      return;
    }

    if (event.eventType === "run.started" || event.eventType === "agent.summary") {
      return;
    }

    if (run?.triggerMessageId) {
      await input.adapter.removeReaction(run.triggerMessageId, WORKING_REACTION_EMOJI).catch(() => {});
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
