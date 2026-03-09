import type { CancelSignalDriver, OutboundMessage, RepositoryBundle, Session } from "@carvis/core";

export async function handleAbortCommand(input: {
  session: Session;
  repositories: RepositoryBundle;
  cancelSignals: CancelSignalDriver;
  now?: () => Date;
}): Promise<OutboundMessage> {
  const activeRun = await input.repositories.runs.findActiveRunBySession(input.session.id);

  if (!activeRun) {
    return {
      chatId: input.session.chatId,
      runId: null,
      kind: "status",
      content: "当前没有活动运行",
    };
  }

  const requestedAt = (input.now ?? (() => new Date()))().toISOString();
  await input.repositories.runs.markCancelRequested(activeRun.id, requestedAt);
  await input.cancelSignals.requestCancellation(activeRun.id);

  return {
    chatId: input.session.chatId,
    runId: activeRun.id,
    kind: "status",
    content: "已发出取消请求",
  };
}
