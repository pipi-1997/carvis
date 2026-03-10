import type { AgentConfig, OutboundMessage, RepositoryBundle, RuntimeConfig, Session } from "@carvis/core";

import { createWorkspaceProvisioner, validateWorkspaceKey } from "../services/workspace-provisioner.ts";
import { createWorkspaceResolver } from "../services/workspace-resolver.ts";

export async function handleBindCommand(input: {
  session: Session;
  chatType: "private" | "group";
  workspaceKey: string | null;
  agentConfig: AgentConfig;
  repositories: RepositoryBundle;
  workspaceResolverConfig: RuntimeConfig["workspaceResolver"];
  logger?: ReturnType<typeof import("@carvis/core").createRuntimeLogger>;
  now?: () => Date;
}): Promise<OutboundMessage> {
  const now = input.now ?? (() => new Date());
  const resetContinuationBinding = async () => {
    const continuationBinding = await input.repositories.conversationSessionBindings.getBindingBySessionId(
      input.session.id,
    );
    if (!continuationBinding?.bridgeSessionId) {
      return;
    }

    await input.repositories.conversationSessionBindings.markBindingReset({
      session: input.session,
      now: now(),
    });
  };

  if (!input.workspaceKey) {
    return {
      chatId: input.session.chatId,
      runId: null,
      kind: "status",
      content: "用法: /bind <workspace-key>",
    };
  }

  const workspaceKeyValidationError = validateWorkspaceKey(input.workspaceKey);
  if (workspaceKeyValidationError) {
    return {
      chatId: input.session.chatId,
      runId: null,
      kind: "error",
      content: workspaceKeyValidationError,
    };
  }

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
  const currentBinding = await workspaceResolver.resolveCurrentBinding({
    session: input.session,
    chatType: input.chatType,
    now: now(),
  });

  if (currentBinding.kind === "resolved" && currentBinding.workspaceKey === input.workspaceKey) {
    input.logger?.workspaceBindState("noop_already_bound", {
      agentId: input.agentConfig.id,
      chatId: input.session.chatId,
      sessionId: input.session.id,
      workspaceKey: input.workspaceKey,
      workspacePath: currentBinding.workspacePath,
    });
    return {
      chatId: input.session.chatId,
      runId: null,
      kind: "status",
      content: `当前会话已绑定 workspace: ${input.workspaceKey}`,
    };
  }

  if (currentBinding.kind === "resolved") {
    const activeRun = await input.repositories.runs.findActiveRunBySession(input.session.id);
    if (activeRun) {
      input.logger?.workspaceBindState("rejected_active_run", {
        agentId: input.agentConfig.id,
        chatId: input.session.chatId,
        sessionId: input.session.id,
        workspaceKey: input.workspaceKey,
        workspacePath: activeRun.workspace,
      });
      return {
        chatId: input.session.chatId,
        runId: activeRun.id,
        kind: "status",
        content: "当前会话存在活动运行，请等待当前运行结束或先取消当前运行",
      };
    }
  }

  const existingWorkspace = await workspaceProvisioner.resolveWorkspace(input.workspaceKey);
  if (existingWorkspace) {
    await input.repositories.sessionWorkspaceBindings.saveBinding({
      session: input.session,
      workspaceKey: input.workspaceKey,
      bindingSource: "manual",
      now: now(),
    });
    await resetContinuationBinding();
    input.logger?.workspaceBindState("bound", {
      agentId: input.agentConfig.id,
      chatId: input.session.chatId,
      sessionId: input.session.id,
      workspaceKey: input.workspaceKey,
      workspacePath: existingWorkspace.workspacePath,
    });
    return {
      chatId: input.session.chatId,
      runId: null,
      kind: "status",
      content: `已绑定 workspace: ${input.workspaceKey}`,
    };
  }

  try {
    const createdWorkspace = await workspaceProvisioner.createWorkspace(input.workspaceKey);
    await input.repositories.sessionWorkspaceBindings.saveBinding({
      session: input.session,
      workspaceKey: input.workspaceKey,
      bindingSource: "created",
      now: now(),
    });
    await resetContinuationBinding();
    input.logger?.workspaceBindState("created", {
      agentId: input.agentConfig.id,
      chatId: input.session.chatId,
      sessionId: input.session.id,
      workspaceKey: input.workspaceKey,
      workspacePath: createdWorkspace.workspacePath,
    });
    return {
      chatId: input.session.chatId,
      runId: null,
      kind: "status",
      content: `已创建并绑定 workspace: ${input.workspaceKey}`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    input.logger?.workspaceBindState("create_failed", {
      agentId: input.agentConfig.id,
      chatId: input.session.chatId,
      sessionId: input.session.id,
      workspaceKey: input.workspaceKey,
      reason,
    });
    return {
      chatId: input.session.chatId,
      runId: null,
      kind: "error",
      content: reason,
    };
  }
}
