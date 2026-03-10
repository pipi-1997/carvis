import type {
  AgentConfig,
  CancelSignalDriver,
  OutboundMessage,
  QueueDriver,
  RepositoryBundle,
  RuntimeConfig,
  Session,
} from "@carvis/core";
import type { FeishuAdapter } from "@carvis/channel-feishu";

import { handleAbortCommand } from "../commands/abort.ts";
import { handleBindCommand } from "../commands/bind.ts";
import { handleHelpCommand } from "../commands/help.ts";
import { handleNewCommand } from "../commands/new.ts";
import { handleStatusCommand } from "../commands/status.ts";
import { resolveRequestedSession } from "../services/continuation-binding.ts";
import { createWorkspaceProvisioner } from "../services/workspace-provisioner.ts";
import { createWorkspaceResolver } from "../services/workspace-resolver.ts";

export function createFeishuWebhookHandler(input: {
  agentConfig: AgentConfig;
  adapter: FeishuAdapter;
  repositories: RepositoryBundle;
  queue: QueueDriver;
  workspaceResolverConfig: RuntimeConfig["workspaceResolver"];
  cancelSignals: CancelSignalDriver;
  logger?: ReturnType<typeof import("@carvis/core").createRuntimeLogger>;
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
  const workspaceProvisioner = createWorkspaceProvisioner({
    repositories: input.repositories,
    workspaceResolverConfig: input.workspaceResolverConfig,
  });
  const workspaceResolver = createWorkspaceResolver({
    agentConfig: input.agentConfig,
    repositories: input.repositories,
    workspaceResolverConfig: input.workspaceResolverConfig,
    workspaceProvisioner,
  });

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
    const messageText = (() => {
      try {
        const content = JSON.parse(payload.event.message.content) as { text?: string };
        return content.text?.trim() ?? "";
      } catch {
        return "";
      }
    })();
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

    if (envelope.rawText !== messageText) {
      input.logger?.commandState("mention_normalized", {
        agentId: input.agentConfig.id,
        chatId: session.chatId,
        sessionId: session.id,
        normalizedText: envelope.rawText,
        rawText: messageText,
      });
    }

    if (envelope.command) {
      input.logger?.commandState("recognized", {
        agentId: input.agentConfig.id,
        chatId: session.chatId,
        sessionId: session.id,
        command: envelope.command,
        normalizedText: envelope.rawText,
      });
    }

    if (envelope.unknownCommand) {
      input.logger?.commandState("unknown", {
        agentId: input.agentConfig.id,
        chatId: session.chatId,
        sessionId: session.id,
        command: envelope.unknownCommand,
        normalizedText: envelope.rawText,
        reason: "unsupported_slash_command",
      });
      const message = await handleHelpCommand({
        session,
        chatType: envelope.chatType,
        unknownCommand: envelope.unknownCommand,
      });
      await input.notifier.sendMessage(message);
      return {
        status: 200,
        body: { ok: true },
      };
    }

    if (envelope.command === "status") {
      const message = await handleStatusCommand({
        session,
        chatType: envelope.chatType,
        agentConfig: input.agentConfig,
        repositories: input.repositories,
        queue: input.queue,
        workspaceResolverConfig: input.workspaceResolverConfig,
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

    if (envelope.command === "help") {
      const message = await handleHelpCommand({
        session,
        chatType: envelope.chatType,
      });
      await input.notifier.sendMessage(message);
      return {
        status: 200,
        body: { ok: true },
      };
    }

    if (envelope.command === "bind") {
      const message = await handleBindCommand({
        session,
        chatType: envelope.chatType,
        workspaceKey: envelope.commandArgs[0] ?? null,
        agentConfig: input.agentConfig,
        repositories: input.repositories,
        workspaceResolverConfig: input.workspaceResolverConfig,
        logger: input.logger,
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
    const resolvedWorkspace = await workspaceResolver.resolveForPrompt({
      session,
      chatType: envelope.chatType,
      now: now(),
    });

    if (resolvedWorkspace.kind === "unbound") {
      input.logger?.workspaceResolutionState("unbound", {
        agentId: input.agentConfig.id,
        chatId: session.chatId,
        sessionId: session.id,
        trigger: "prompt",
      });
      await input.notifier.sendMessage({
        chatId: session.chatId,
        runId: null,
        kind: "status",
        content: resolvedWorkspace.message,
      });
      return {
        status: 200,
        body: { ok: true, unbound: true },
      };
    }

    input.logger?.workspaceResolutionState(resolvedWorkspace.bindingSource, {
      agentId: input.agentConfig.id,
      chatId: session.chatId,
      sessionId: session.id,
      workspaceKey: resolvedWorkspace.workspaceKey,
      workspacePath: resolvedWorkspace.workspacePath,
      trigger: "prompt",
    });

    const { requestedSessionMode, requestedBridgeSessionId } = resolveRequestedSession({
      binding,
      workspace: resolvedWorkspace.workspacePath,
    });
    const activeRun = await input.repositories.runs.findActiveRunByWorkspace(resolvedWorkspace.workspacePath);
    const run = await input.repositories.runs.createQueuedRun({
      sessionId: session.id,
      agentId: input.agentConfig.id,
      workspace: resolvedWorkspace.workspacePath,
      prompt: envelope.prompt,
      triggerMessageId: envelope.messageId,
      triggerUserId: envelope.userId,
      timeoutSeconds: input.agentConfig.timeoutSeconds,
      requestedSessionMode,
      requestedBridgeSessionId,
      now: now(),
    });
    const queuePosition = (await input.queue.enqueue(resolvedWorkspace.workspacePath, run.id)) + (activeRun ? 1 : 0);
    await input.repositories.runs.updateQueuePosition(run.id, queuePosition);
    const queuedEvent = await input.repositories.events.appendEvent({
      runId: run.id,
      eventType: "run.queued",
      payload: {
        run_id: run.id,
        workspace: resolvedWorkspace.workspacePath,
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
