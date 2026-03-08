import type { AgentConfig, OutboundMessage, Session, StatusSnapshot } from "@carvis/core";
import type { RepositoryBundle } from "@carvis/core";
import type { QueueDriver } from "@carvis/core";

import { formatStatusSnapshot } from "../services/status-presenter.ts";

export async function handleStatusCommand(input: {
  session: Session;
  agentConfig: AgentConfig;
  repositories: RepositoryBundle;
  queue: QueueDriver;
}): Promise<OutboundMessage> {
  const activeRun = await input.repositories.runs.findActiveRunByWorkspace(input.agentConfig.workspace);
  const latestRun = await input.repositories.runs.getLatestRunBySession(input.session.id);
  const isLatestRunQueued = latestRun?.status === "queued";
  const aheadCount =
    latestRun && isLatestRunQueued
      ? await input.queue.aheadCount(input.agentConfig.workspace, latestRun.id, Boolean(activeRun))
      : 0;
  const snapshot: StatusSnapshot = {
    agentId: input.agentConfig.id,
    workspace: input.agentConfig.workspace,
    activeRun,
    latestRun,
    isLatestRunQueued,
    aheadCount,
  };

  return {
    chatId: input.session.chatId,
    runId: latestRun?.id ?? null,
    kind: "status",
    content: formatStatusSnapshot(snapshot),
  };
}
