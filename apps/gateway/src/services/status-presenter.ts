import type { StatusSnapshot } from "@carvis/core";

export function formatStatusSnapshot(snapshot: StatusSnapshot): string {
  const lines = [
    `agent: ${snapshot.agentId}`,
    `workspace: ${snapshot.workspace}`,
  ];

  if (snapshot.activeRun) {
    lines.push(`当前活动运行: ${snapshot.activeRun.status}`);
  } else {
    lines.push("当前无活动运行");
  }

  lines.push(`最近运行状态: ${snapshot.latestRun?.status ?? "none"}`);
  lines.push(`当前会话最近请求排队: ${snapshot.isLatestRunQueued ? "是" : "否"}`);
  lines.push(`前方队列长度: ${snapshot.aheadCount}`);
  lines.push(`当前会话续聊: ${snapshot.continuationState}`);

  return lines.join("\n");
}
