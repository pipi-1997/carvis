import type { AgentConfig, OutboundMessage, RepositoryBundle, RuntimeConfig, Session } from "@carvis/core";

import { createSandboxModeResolver } from "../services/sandbox-mode-resolver.ts";
import { createWorkspaceProvisioner } from "../services/workspace-provisioner.ts";
import { createWorkspaceResolver } from "../services/workspace-resolver.ts";

const MODE_USAGE = "用法: /mode | /mode workspace-write | /mode danger-full-access | /mode reset";

export async function handleModeCommand(input: {
  session: Session;
  chatType: "private" | "group";
  userId: string;
  agentConfig: AgentConfig;
  repositories: RepositoryBundle;
  workspaceResolverConfig: RuntimeConfig["workspaceResolver"];
  logger?: ReturnType<typeof import("@carvis/core").createRuntimeLogger>;
  commandArg?: string | null;
  now?: () => Date;
}): Promise<OutboundMessage> {
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
  const sandboxModeResolver = createSandboxModeResolver({
    defaultWorkspaceKey: input.agentConfig.defaultWorkspace,
    repositories: input.repositories,
    workspaceResolverConfig: input.workspaceResolverConfig,
  });
  const resolvedWorkspace = await workspaceResolver.resolveCurrentBinding({
    session: input.session,
    chatType: input.chatType,
    now: now(),
  });

  if (resolvedWorkspace.kind === "unbound") {
    return {
      chatId: input.session.chatId,
      runId: null,
      kind: "status",
      content: resolvedWorkspace.message,
    };
  }

  const current = await sandboxModeResolver.resolveForChat({
    session: input.session,
    workspaceKey: resolvedWorkspace.workspaceKey,
    workspacePath: resolvedWorkspace.workspacePath,
    now: now(),
  });
  const commandArg = input.commandArg ?? null;
  const commandNow = now();

  if (!commandArg) {
    return {
      chatId: input.session.chatId,
      runId: null,
      kind: "status",
      content: formatModeStatus(current),
    };
  }

  if (commandArg === "reset") {
    await input.repositories.chatSandboxOverrides.deleteOverrideBySessionId(input.session.id);
    const workspaceDefault = sandboxModeResolver.resolveWorkspaceDefault({
      workspaceKey: resolvedWorkspace.workspaceKey,
    });
    input.logger?.sandboxModeState("reset", {
      agentId: input.agentConfig.id,
      chatId: input.session.chatId,
      sessionId: input.session.id,
      workspaceKey: resolvedWorkspace.workspaceKey,
      workspacePath: resolvedWorkspace.workspacePath,
      sandboxMode: workspaceDefault.resolvedSandboxMode,
      sandboxModeSource: "workspace_default",
    });
    return {
      chatId: input.session.chatId,
      runId: null,
      kind: "status",
      content: `已清除当前会话 sandbox override，后续消息将使用 workspace 默认模式: ${workspaceDefault.resolvedSandboxMode}`,
    };
  }

  if (commandArg !== "workspace-write" && commandArg !== "danger-full-access") {
    return {
      chatId: input.session.chatId,
      runId: null,
      kind: "status",
      content: MODE_USAGE,
    };
  }

  const expiresAt = sandboxModeResolver.buildOverrideExpiry(commandNow);
  const renewOnly = current.resolvedSandboxMode === commandArg && current.sandboxModeSource === "chat_override";

  await input.repositories.chatSandboxOverrides.upsertOverride({
    sessionId: input.session.id,
    chatId: input.session.chatId,
    agentId: input.session.agentId,
    workspace: resolvedWorkspace.workspacePath,
    sandboxMode: commandArg,
    expiresAt,
    setByUserId: input.userId,
    now: commandNow,
  });
  input.logger?.sandboxModeState("set", {
    agentId: input.agentConfig.id,
    chatId: input.session.chatId,
    sessionId: input.session.id,
    workspaceKey: resolvedWorkspace.workspaceKey,
    workspacePath: resolvedWorkspace.workspacePath,
    sandboxMode: commandArg,
    sandboxModeSource: "chat_override",
    expiresAt,
  });

  return {
    chatId: input.session.chatId,
    runId: null,
    kind: "status",
    content: renewOnly
      ? `已更新当前会话 sandbox mode: ${commandArg} 的有效期，30 分钟后过期`
      : `已为当前会话设置 sandbox mode: ${commandArg}，30 分钟后过期`,
  };
}

function formatModeStatus(input: {
  resolvedSandboxMode: string;
  sandboxModeSource: string;
  sandboxOverrideExpiresAt: string | null;
  sandboxOverrideExpired: boolean;
}) {
  const lines = [
    `当前 sandbox mode: ${input.resolvedSandboxMode}`,
    `来源: ${input.sandboxModeSource}`,
  ];

  if (input.sandboxOverrideExpiresAt) {
    lines.push(
      input.sandboxOverrideExpired
        ? `override: 已过期（${input.sandboxOverrideExpiresAt}）`
        : `override 有效期至: ${input.sandboxOverrideExpiresAt}`,
    );
  }

  return lines.join("\n");
}
