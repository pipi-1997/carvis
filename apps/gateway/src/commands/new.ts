import type { AgentConfig, OutboundMessage, RepositoryBundle, Session } from "@carvis/core";

export async function handleNewCommand(input: {
  session: Session;
  agentConfig: AgentConfig;
  repositories: RepositoryBundle;
  now?: () => Date;
}): Promise<OutboundMessage> {
  await input.repositories.chatSandboxOverrides.deleteOverrideBySessionId(input.session.id);
  await input.repositories.conversationSessionBindings.markBindingReset({
    session: input.session,
    now: (input.now ?? (() => new Date()))(),
  });

  return {
    chatId: input.session.chatId,
    runId: null,
    kind: "status",
    content: "已重置当前会话续聊上下文并清除 sandbox override，workspace 绑定保持不变，后续普通消息将从 fresh 会话和工作区默认模式开始",
  };
}
