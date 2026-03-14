import type { AgentConfig, ChatType, OutboundMessage, QueueDriver, RepositoryBundle, RuntimeConfig, Session, StatusSnapshot } from "@carvis/core";

import { formatStatusSnapshot } from "../services/status-presenter.ts";
import { createSandboxModeResolver } from "../services/sandbox-mode-resolver.ts";
import { createWorkspaceProvisioner } from "../services/workspace-provisioner.ts";
import { createWorkspaceResolver } from "../services/workspace-resolver.ts";

export async function handleStatusCommand(input: {
  session: Session;
  chatType: ChatType;
  agentConfig: AgentConfig;
  repositories: RepositoryBundle;
  queue: QueueDriver;
  workspaceResolverConfig: RuntimeConfig["workspaceResolver"];
}): Promise<OutboundMessage> {
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
  const sandboxModeResolver = createSandboxModeResolver({
    defaultWorkspaceKey: input.agentConfig.defaultWorkspace,
    repositories: input.repositories,
    workspaceResolverConfig: input.workspaceResolverConfig,
  });
  const resolvedBinding = await workspaceResolver.resolveCurrentBinding({
    session: input.session,
    chatType: input.chatType,
  });
  const latestRun = await input.repositories.runs.getLatestRunBySession(input.session.id);
  const binding = await input.repositories.conversationSessionBindings.getBindingBySessionId(input.session.id);
  const activeRun =
    resolvedBinding.kind === "resolved"
      ? await input.repositories.runs.findActiveRunByWorkspace(resolvedBinding.workspacePath)
      : null;
  const isLatestRunQueued = latestRun?.status === "queued";
  const aheadCount =
    resolvedBinding.kind === "resolved" && latestRun && isLatestRunQueued
      ? await input.queue.aheadCount(resolvedBinding.workspacePath, latestRun.id, Boolean(activeRun))
      : 0;
  const snapshot: StatusSnapshot = {
    agentId: input.agentConfig.id,
    workspace: resolvedBinding.kind === "resolved" ? resolvedBinding.workspacePath : null,
    workspaceKey: resolvedBinding.kind === "resolved" ? resolvedBinding.workspaceKey : null,
    workspaceBindingSource: resolvedBinding.bindingSource,
    activeRun,
    latestRun,
    isLatestRunQueued,
    aheadCount,
    continuationState:
      binding?.status === "recovered"
        ? "recent_recovered"
        : binding?.status === "reset"
          ? "recent_reset"
          : binding?.status === "invalidated" && binding.lastRecoveryResult === "failed"
            ? "recent_recovery_failed"
          : binding?.bridgeSessionId
              ? "continued"
              : "fresh",
  };

  if (resolvedBinding.kind === "resolved") {
    const sandbox = await sandboxModeResolver.resolveForChat({
      session: input.session,
      workspaceKey: resolvedBinding.workspaceKey,
      workspacePath: resolvedBinding.workspacePath,
    });
    snapshot.sandboxMode = sandbox.resolvedSandboxMode;
    snapshot.sandboxModeSource = sandbox.sandboxModeSource;
    snapshot.sandboxOverrideExpiresAt = sandbox.sandboxOverrideExpiresAt;
    snapshot.sandboxOverrideExpired = sandbox.sandboxOverrideExpired;
  }

  return {
    chatId: input.session.chatId,
    runId: latestRun?.id ?? null,
    kind: "status",
    content: formatStatusSnapshot(snapshot),
  };
}
