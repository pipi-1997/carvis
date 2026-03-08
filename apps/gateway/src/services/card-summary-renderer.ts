import type { Run, RunStatus } from "@carvis/core";

export function renderTerminalCardSummary(input: {
  lastOutputExcerpt?: string | null;
  reason?: string | null;
  resultSummary?: string | null;
  run: Pick<Run, "finishedAt" | "startedAt">;
  status: Extract<RunStatus, "completed" | "failed" | "cancelled">;
}): {
  body: string;
  title: string;
} {
  const title = TERMINAL_TITLES[input.status];
  const lines = [
    `**状态**：${TERMINAL_LABELS[input.status]}`,
    `**摘要**：${buildSummary(input)}`,
  ];

  const duration = formatDuration(input.run.startedAt, input.run.finishedAt);
  if (duration) {
    lines.push(`**耗时**：${duration}`);
  }

  if (input.reason && input.status !== "completed") {
    lines.push(`**原因**：${input.reason}`);
  }

  if (input.lastOutputExcerpt) {
    lines.push("**最后输出**：");
    lines.push(input.lastOutputExcerpt);
  }

  return {
    body: lines.join("\n"),
    title,
  };
}

function buildSummary(input: {
  reason?: string | null;
  resultSummary?: string | null;
  status: Extract<RunStatus, "completed" | "failed" | "cancelled">;
}) {
  if (input.status === "completed") {
    return input.resultSummary?.trim() || "本轮运行已完成。";
  }

  return input.reason?.trim() || FALLBACK_SUMMARIES[input.status];
}

function formatDuration(startedAt: string | null, finishedAt: string | null) {
  if (!startedAt || !finishedAt) {
    return null;
  }

  const started = Date.parse(startedAt);
  const finished = Date.parse(finishedAt);
  if (Number.isNaN(started) || Number.isNaN(finished) || finished < started) {
    return null;
  }

  const totalSeconds = Math.round((finished - started) / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return remainMinutes > 0 ? `${hours}h ${remainMinutes}m` : `${hours}h`;
}

const TERMINAL_LABELS = {
  cancelled: "已取消",
  completed: "已完成",
  failed: "已失败",
} as const;

const TERMINAL_TITLES = {
  cancelled: "运行已取消",
  completed: "运行已完成",
  failed: "运行失败",
} as const;

const FALLBACK_SUMMARIES = {
  cancelled: "运行已被取消。",
  failed: "运行失败。",
} as const;
