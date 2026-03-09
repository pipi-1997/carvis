import type { AgentConfig, OutboundMessage, RepositoryBundle, Session } from "@carvis/core";

export async function handleNewCommand(input: {
  session: Session;
  agentConfig: AgentConfig;
  repositories: RepositoryBundle;
  now?: () => Date;
}): Promise<OutboundMessage> {
  await input.repositories.conversationSessionBindings.markBindingReset({
    session: input.session,
    now: (input.now ?? (() => new Date()))(),
  });

  return {
    chatId: input.session.chatId,
    runId: null,
    kind: "status",
    content: "已重置当前会话续聊上下文，workspace 绑定保持不变，后续普通消息将从新会话开始",
  };
}
