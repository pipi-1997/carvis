import type { StatusSnapshot } from "@carvis/core";

export function formatStatusSnapshot(snapshot: StatusSnapshot): string {
  const lines = [
    `agent: ${snapshot.agentId}`,
    `workspace key: ${snapshot.workspaceKey ?? "(unbound)"}`,
    `workspace 来源: ${snapshot.workspaceBindingSource}`,
  ];

  if (snapshot.workspace) {
    lines.push(`workspace path: ${snapshot.workspace}`);
  }

  if (snapshot.activeRun) {
    lines.push(`当前活动运行: ${snapshot.activeRun.status}`);
  } else {
    lines.push("当前无活动运行");
  }

  lines.push(`最近运行状态: ${snapshot.latestRun?.status ?? "none"}`);
  lines.push(`当前会话最近请求排队: ${snapshot.isLatestRunQueued ? "是" : "否"}`);
  lines.push(`前方队列长度: ${snapshot.aheadCount}`);
  lines.push(`当前会话续聊: ${snapshot.continuationState}`);
  if (snapshot.sandboxMode) {
    lines.push(`sandbox mode: ${snapshot.sandboxMode}`);
    lines.push(`sandbox 来源: ${snapshot.sandboxModeSource ?? "workspace_default"}`);
    if (snapshot.sandboxOverrideExpiresAt) {
      lines.push(
        snapshot.sandboxOverrideExpired
          ? `sandbox override: 已过期（${snapshot.sandboxOverrideExpiresAt}）`
          : `sandbox override 到期: ${snapshot.sandboxOverrideExpiresAt}`,
      );
    }
  }

  if (snapshot.workspaceBindingSource === "unbound") {
    lines.push("下一步: /bind <workspace-key>");
  }

  return lines.join("\n");
}
