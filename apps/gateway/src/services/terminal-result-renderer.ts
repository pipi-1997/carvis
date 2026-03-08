import type { Run, RunEvent, RunStatus, TerminalResultDocument } from "@carvis/core";

export function renderTerminalResultDocument(input: {
  lastOutputExcerpt?: string | null;
  run: Pick<Run, "failureMessage" | "finishedAt" | "id" | "startedAt" | "workspace">;
  terminalEvent: Pick<RunEvent, "eventType" | "payload">;
}): TerminalResultDocument {
  const status = resolveTerminalStatus(input.terminalEvent.eventType);
  const resultSummary = stringOrNull(input.terminalEvent.payload.result_summary);
  const reason =
    stringOrNull(input.terminalEvent.payload.failure_message) ??
    stringOrNull(input.terminalEvent.payload.reason) ??
    input.run.failureMessage;

  if (status === "completed") {
    return {
      runId: input.run.id,
      headline: "已完成",
      conclusion: resultSummary?.trim() || "本轮运行已完成。",
      changes: [
        resultSummary?.trim() || "结果已生成，可直接查看本条回复与过程摘要卡。",
        `工作区：${input.run.workspace}`,
      ],
      verification: [
        buildDurationLine(input.run.startedAt, input.run.finishedAt),
        input.lastOutputExcerpt ? `最后输出：${input.lastOutputExcerpt}` : "最后输出：无可展示摘录",
      ],
      nextSteps: ["如需继续，请直接在当前会话发送下一条指令。"],
      status,
    };
  }

  if (status === "failed") {
    return {
      runId: input.run.id,
      headline: "运行失败",
      conclusion: reason?.trim() || "本轮运行失败。",
      changes: [
        "主交付未完整完成。",
        `工作区：${input.run.workspace}`,
      ],
      verification: [
        buildDurationLine(input.run.startedAt, input.run.finishedAt),
        input.lastOutputExcerpt ? `最后输出：${input.lastOutputExcerpt}` : "最后输出：无可展示摘录",
      ],
      nextSteps: ["检查失败原因后重试，或补充更明确的上下文后再次发起请求。"],
      status,
    };
  }

  return {
    runId: input.run.id,
    headline: "运行已取消",
    conclusion: reason?.trim() || "本轮运行已取消。",
    changes: [
      "本轮运行已提前结束，未继续追加过程输出。",
      `工作区：${input.run.workspace}`,
    ],
    verification: [
      buildDurationLine(input.run.startedAt, input.run.finishedAt),
      input.lastOutputExcerpt ? `最后输出：${input.lastOutputExcerpt}` : "最后输出：无可展示摘录",
    ],
    nextSteps: ["如需继续，请重新发起请求。"],
    status,
  };
}

export function formatTerminalResultMessage(document: TerminalResultDocument): {
  content: string;
  title: string;
} {
  if (document.status === "completed" || looksLikeStructuredSummary(document.conclusion)) {
    return {
      title: document.headline,
      content: document.conclusion.trim(),
    };
  }

  return {
    title: document.headline,
    content: [
      "## 结论",
      document.conclusion,
      "",
      "## 主要变更",
      ...formatList(document.changes),
      "",
      "## 验证",
      ...formatList(document.verification),
      "",
      "## 下一步",
      ...formatList(document.nextSteps),
    ].join("\n"),
  };
}

function buildDurationLine(startedAt: string | null, finishedAt: string | null) {
  if (!startedAt || !finishedAt) {
    return "耗时：未记录";
  }

  const started = Date.parse(startedAt);
  const finished = Date.parse(finishedAt);
  if (Number.isNaN(started) || Number.isNaN(finished) || finished < started) {
    return "耗时：未记录";
  }

  const seconds = Math.max(0, Math.round((finished - started) / 1000));
  return `耗时：${seconds}s`;
}

function formatList(items: string[]) {
  if (items.length === 0) {
    return ["- 无"];
  }

  return items.map((item) => `- ${item}`);
}

function looksLikeStructuredSummary(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  return ["结论", "主要变更", "验证", "下一步"].filter((section) => {
    return normalized.includes(`**${section}**`) || normalized.includes(`## ${section}`);
  }).length >= 2;
}

function resolveTerminalStatus(eventType: RunEvent["eventType"]): Extract<RunStatus, "completed" | "failed" | "cancelled"> {
  if (eventType === "run.completed") {
    return "completed";
  }
  if (eventType === "run.failed") {
    return "failed";
  }
  return "cancelled";
}

function stringOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
