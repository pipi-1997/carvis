import type { AgentConfig, CancelSignalDriver, OutboundMessage, QueueDriver, RepositoryBundle, Session } from "@carvis/core";
import type { FeishuAdapter } from "@carvis/channel-feishu";

import { handleAbortCommand } from "../commands/abort.ts";
import { handleNewCommand } from "../commands/new.ts";
import { handleStatusCommand } from "../commands/status.ts";

export function createFeishuWebhookHandler(input: {
  agentConfig: AgentConfig;
  adapter: FeishuAdapter;
  repositories: RepositoryBundle;
  queue: QueueDriver;
  cancelSignals: CancelSignalDriver;
  allowlist: {
    isAllowed(input: { chatId: string; userId: string }): boolean;
  };
  notifier: {
    notifyRunEvent(session: Session, event: Awaited<ReturnType<RepositoryBundle["events"]["appendEvent"]>>): Promise<void>;
    sendMessage(message: OutboundMessage): Promise<void>;
  };
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());

  return async function handle(rawBody: string, headers: Record<string, string | undefined>) {
    const verified = await input.adapter.verifyWebhook({
      headers,
      rawBody,
    });

    if (!verified) {
      return {
        status: 401,
        body: {
          ok: false,
          error: "invalid_signature",
        },
      };
    }

    const payload = JSON.parse(rawBody);
    const envelope = await input.adapter.parseInbound(payload);

    if (!input.allowlist.isAllowed({ chatId: envelope.chatId, userId: envelope.userId })) {
      return {
        status: 403,
        body: {
          ok: false,
          error: "forbidden",
        },
      };
    }

    const session = await input.repositories.sessions.getOrCreateSession({
      channel: envelope.channel,
      chatId: envelope.chatId,
      agentConfig: input.agentConfig,
      now: now(),
    });

    if (envelope.command === "status") {
      const message = await handleStatusCommand({
        session,
        agentConfig: input.agentConfig,
        repositories: input.repositories,
        queue: input.queue,
      });
      await input.notifier.sendMessage(message);
      return {
        status: 200,
        body: { ok: true },
      };
    }

    if (envelope.command === "abort") {
      const message = await handleAbortCommand({
        session,
        agentConfig: input.agentConfig,
        repositories: input.repositories,
        cancelSignals: input.cancelSignals,
        now,
      });
      await input.notifier.sendMessage(message);
      return {
        status: 200,
        body: { ok: true },
      };
    }

    if (envelope.command === "new") {
      const message = await handleNewCommand({
        session,
        agentConfig: input.agentConfig,
        repositories: input.repositories,
        now,
      });
      await input.notifier.sendMessage(message);
      return {
        status: 200,
        body: { ok: true },
      };
    }

    if (!envelope.prompt) {
      return {
        status: 400,
        body: {
          ok: false,
          error: "empty_prompt",
        },
      };
    }

    const binding = await input.repositories.conversationSessionBindings.getBindingBySessionId(session.id);
    const requestedSessionMode = binding?.bridgeSessionId ? "continuation" : "fresh";
    const activeRun = await input.repositories.runs.findActiveRunByWorkspace(input.agentConfig.workspace);
    const run = await input.repositories.runs.createQueuedRun({
      sessionId: session.id,
      agentId: input.agentConfig.id,
      workspace: input.agentConfig.workspace,
      prompt: envelope.prompt,
      triggerMessageId: envelope.messageId,
      triggerUserId: envelope.userId,
      timeoutSeconds: input.agentConfig.timeoutSeconds,
      requestedSessionMode,
      requestedBridgeSessionId: binding?.bridgeSessionId ?? null,
      now: now(),
    });
    const queuePosition = (await input.queue.enqueue(input.agentConfig.workspace, run.id)) + (activeRun ? 1 : 0);
    await input.repositories.runs.updateQueuePosition(run.id, queuePosition);
    const queuedEvent = await input.repositories.events.appendEvent({
      runId: run.id,
      eventType: "run.queued",
      payload: {
        run_id: run.id,
        workspace: input.agentConfig.workspace,
        queue_position: queuePosition,
      },
      now: now(),
    });
    await input.notifier.notifyRunEvent(session, queuedEvent);

    return {
      status: 202,
      body: {
        ok: true,
        runId: run.id,
      },
    };
  };
}
