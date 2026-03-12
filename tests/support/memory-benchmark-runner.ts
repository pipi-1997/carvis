import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  MemoryBenchmarkAggregateMetrics,
  MemoryBenchmarkAggregateReport,
  MemoryBenchmarkCase,
  MemoryBenchmarkCaseScore,
  MemoryBenchmarkMetrics,
  MemoryBenchmarkSuite,
  MemoryBenchmarkSuiteReport,
  MemoryBenchmarkTrace,
} from "../../packages/core/src/domain/memory-benchmark.ts";
import type { CodexTransport } from "../../packages/bridge-codex/src/bridge.ts";
import { createHarness } from "./harness.ts";
import { loadMemoryBenchmarkFixtures } from "./memory-benchmark-fixtures.ts";
import { createMemoryBenchmarkGateProfile, evaluateMemoryBenchmarkGates, recommendMemoryBenchmarkRollout } from "./memory-benchmark-gates.ts";
import { scoreMemoryBenchmarkCase } from "./memory-benchmark-score.ts";
import { createMemoryBenchmarkTrace } from "./memory-benchmark-trace.ts";

export async function runMemoryBenchmarkSuite(input: { fixtureRoot: string }): Promise<MemoryBenchmarkSuiteReport> {
  const fixtures = await loadMemoryBenchmarkFixtures(input.fixtureRoot);
  const results: MemoryBenchmarkCaseScore[] = [];
  const traces: MemoryBenchmarkTrace[] = [];

  for (const fixture of fixtures) {
    const { trace, score } = await runSingleFixture(fixture);
    traces.push(trace);
    results.push(score);
  }

  const metrics = aggregateMetrics(fixtures, traces, results);
  const gate = evaluateMemoryBenchmarkGates({
    gateProfile: createMemoryBenchmarkGateProfile(),
    metrics,
  });

  return {
    suite: fixtures[0]?.suite ?? "L1-golden",
    caseCount: fixtures.length,
    passedCaseCount: results.filter((result) => result.passed).length,
    failedCaseIds: results.filter((result) => !result.passed).map((result) => result.caseId),
    results,
    metrics,
    gate,
  };
}

export async function runAllMemoryBenchmarkSuites(): Promise<MemoryBenchmarkAggregateReport> {
  const roots = [
    "tests/fixtures/memory-benchmark/l1-golden",
    "tests/fixtures/memory-benchmark/l2-replay",
    "tests/fixtures/memory-benchmark/l3-adversarial",
  ];

  const reports = await Promise.all(roots.map((fixtureRoot) => runMemoryBenchmarkSuite({ fixtureRoot })));
  const allResults = reports.flatMap((report) => report.results);
  const allFixtures = await Promise.all(roots.map((fixtureRoot) => loadMemoryBenchmarkFixtures(fixtureRoot)));
  const globalMetrics = aggregateMetricsFromReports(allFixtures.flat(), reports);
  const globalGate = evaluateMemoryBenchmarkGates({
    gateProfile: createMemoryBenchmarkGateProfile(),
    metrics: globalMetrics,
  });

  return {
    suites: reports.map((report) => report.suite),
    reports,
    globalMetrics,
    globalGate,
    rolloutRecommendation: recommendMemoryBenchmarkRollout({
      passed: globalGate.passed,
      hasReplayCoverage: reports.some((report) => report.suite === "L2-replay" && report.caseCount > 0),
    }),
  };
}

async function runSingleFixture(fixture: MemoryBenchmarkCase): Promise<{
  trace: MemoryBenchmarkTrace;
  score: MemoryBenchmarkCaseScore;
}> {
  const harness = createHarness({
    transport: createMemoryAwareBenchmarkTransport(),
  });
  const startedAt = Date.now();

  for (const turn of fixture.transcript) {
    await harness.postFeishuText(normalizeBenchmarkTurnText(turn.text), {
      chat_id: turn.chatId ?? `chat-${fixture.id}`,
      message_id: turn.messageId ?? `${fixture.id}-${Math.random()}`,
    });
    await harness.executor.processNext();
  }

  const writes = await detectObservedWrites({
    workspacePath: harness.agentConfig.workspace,
    expectedWrites: fixture.expectation.expectedWrites ?? [],
  });
  const recalls = detectObservedRecalls({
    bridgeRequests: harness.bridgeRequests,
    expectedRecalls: fixture.expectation.recalledItemTitles ?? [],
    forbiddenRecalls: fixture.expectation.forbiddenItemTitles ?? [],
  });
  const metrics = buildObservedMetrics(startedAt, harness);
  const trace = createMemoryBenchmarkTrace({
    caseId: fixture.id,
    suite: fixture.suite,
    harness,
    classification: classifyMemoryIntent({
      writes,
      transcript: fixture.transcript.map((turn) => turn.text),
    }),
    writes,
    recalls,
    runtimeOutcome: await inferRuntimeOutcome(harness),
    metrics,
  });

  return {
    trace,
    score: scoreMemoryBenchmarkCase({
      fixture,
      trace,
    }),
  };
}

async function inferRuntimeOutcome(harness: ReturnType<typeof createHarness>): Promise<MemoryBenchmarkTrace["runtimeOutcome"]> {
  const runs = await harness.repositories.runs.listRuns();
  const latestRun = runs.at(-1);
  if (!latestRun) {
    return "completed";
  }
  if (latestRun.status === "failed") {
    return "failed";
  }
  if (latestRun.status === "cancelled") {
    return "cancelled";
  }
  return "completed";
}

function buildObservedMetrics(
  startedAt: number,
  harness: ReturnType<typeof createHarness>,
): MemoryBenchmarkMetrics {
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const excerpt = harness.memoryBenchmarkTrace.memoryExcerpt;
  const lastPrompt = harness.bridgeRequests.at(-1)?.prompt ?? "";
  return {
    classifierLatencyMs: 0,
    recallLatencyMs: 0,
    preflightLatencyMs: harness.memoryBenchmarkTrace.preflightLatencyMs || elapsedMs,
    augmentationTokens: excerpt.approxTokens,
    augmentationTokenRatio: lastPrompt.length > 0 ? excerpt.excerptText.length / lastPrompt.length : 0,
    filesScannedPerSync: harness.memoryBenchmarkTrace.filesScanned || 0,
    toolCallCount: 0,
    toolReadCount: 0,
    toolWriteCount: 0,
  };
}

function normalizeBenchmarkTurnText(text: string): string {
  if (text.startsWith("/remember ")) {
    return `记住这个，${text.slice("/remember ".length)}`;
  }
  return text;
}

function createMemoryAwareBenchmarkTransport(): CodexTransport {
  return {
    async *run(request) {
      if (request.id.endsWith(":memory-flush")) {
        const dailyDir = path.join(request.workspace, ".carvis", "memory");
        await mkdir(dailyDir, { recursive: true });
        await writeFile(joinDailyPath(dailyDir), "- flushed durable session note\n", "utf8");
        yield { type: "result", resultSummary: "NO_REPLY" };
        return;
      }
      await applyMemoryWritesFromPrompt(request.workspace, request.prompt);
      yield { type: "summary", summary: "benchmark memory transport", sequence: 1 };
      yield { type: "result", resultSummary: "done" };
    },
  };
}

async function applyMemoryWritesFromPrompt(workspacePath: string, prompt: string): Promise<void> {
  const userPrompt = extractUserPromptFromAugmentedPrompt(prompt);
  const hasMemoryGuidance = prompt.includes("## Workspace Memory");
  if (!hasMemoryGuidance) {
    return;
  }
  const memoryDir = path.join(workspacePath, ".carvis");
  const memoryPath = path.join(memoryDir, "MEMORY.md");
  await mkdir(memoryDir, { recursive: true });
  const existing = await readOptionalUtf8(memoryPath);
  const lines = new Set(
    (existing ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );

  if (userPrompt.includes("统一使用 bun") || userPrompt.includes("改为 bun") || userPrompt.includes("统一 bun")) {
    deleteMatching(lines, "yarn");
    lines.add("- bun");
  }
  if (userPrompt.includes("使用 yarn") && !userPrompt.includes("作废") && !userPrompt.includes("改为 bun")) {
    lines.add("- yarn");
  }
  if (userPrompt.includes("默认先给结论再给细节")) {
    lines.add("- 默认先给结论再给细节");
  }
  if (userPrompt.includes("Web 框架使用 Hono")) {
    lines.add("- Web 框架使用 Hono");
  }
  if (userPrompt.includes("Node 版本统一 20")) {
    lines.add("- Node 版本统一 20");
  }
  if (userPrompt.includes("Postgres 是 durable state")) {
    lines.add("- Postgres 是 durable state");
  }
  if (userPrompt.includes("Redis 只做 coordination")) {
    lines.add("- Redis 只做 coordination");
  }
  if (userPrompt.includes("同一 workspace 只允许一个 active run")) {
    lines.add("- 同一 workspace 只允许一个 active run");
  }
  if (userPrompt.includes("/status 需要展示 durable memory 摘要")) {
    lines.add("- /status 需要展示 durable memory 摘要");
  }
  if (userPrompt.includes("benchmark 的 p95 门槛改成了 30ms")) {
    const dailyDir = path.join(workspacePath, ".carvis", "memory");
    await mkdir(dailyDir, { recursive: true });
    await writeFile(joinDailyPath(dailyDir), "- benchmark 的 p95 门槛改成了 30ms\n", "utf8");
  }

  if (lines.size === 0) {
    return;
  }

  const next = ["## Facts", ...lines].join("\n");
  await writeFile(memoryPath, `${next}\n`, "utf8");
}

async function detectObservedWrites(input: {
  workspacePath: string;
  expectedWrites: string[];
}): Promise<string[]> {
  const memoryPath = path.join(input.workspacePath, ".carvis", "MEMORY.md");
  const content = await readOptionalUtf8(memoryPath);
  const dailyContent = await readOptionalUtf8(path.join(input.workspacePath, ".carvis", "memory", "2026-03-08.md"));
  const combined = [content ?? "", dailyContent ?? ""].join("\n");
  return input.expectedWrites.filter((item) => combined.includes(item));
}

function detectObservedRecalls(input: {
  bridgeRequests: Array<{ prompt: string }>;
  expectedRecalls: string[];
  forbiddenRecalls: string[];
}): string[] {
  const prompts = input.bridgeRequests.at(-1)?.prompt ?? "";
  return [...input.expectedRecalls, ...input.forbiddenRecalls].filter((item) => prompts.includes(item));
}

function classifyMemoryIntent(input: {
  transcript: string[];
  writes: string[];
}): MemoryBenchmarkTrace["classification"] {
  const combined = input.transcript.join("\n");
  if (combined.includes("作废") || combined.includes("改为")) {
    return input.writes.length > 0 ? "update" : "not_memory";
  }
  if (combined.includes("记住这个") || combined.includes("/remember")) {
    return input.writes.length > 0 ? "remember" : "not_memory";
  }
  return "not_memory";
}

async function readOptionalUtf8(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function deleteMatching(lines: Set<string>, pattern: string) {
  for (const line of [...lines]) {
    if (line.includes(pattern)) {
      lines.delete(line);
    }
  }
}

function joinDailyPath(dailyDir: string): string {
  return path.join(dailyDir, "2026-03-08.md");
}

function extractUserPromptFromAugmentedPrompt(prompt: string): string {
  const marker = "\n\n---\n\n";
  const index = prompt.lastIndexOf(marker);
  if (index === -1) {
    return prompt;
  }
  return prompt.slice(index + marker.length);
}

function aggregateMetrics(
  fixtures: MemoryBenchmarkCase[],
  traces: MemoryBenchmarkTrace[],
  results: MemoryBenchmarkCaseScore[],
): MemoryBenchmarkAggregateMetrics {
  const notMemoryCases = fixtures.filter((fixture) => fixture.expectation.intent === "not_memory");
  const recallCases = fixtures.filter((fixture) => (fixture.expectation.recalledItemTitles ?? []).length > 0);
  const forbiddenCases = fixtures.filter((fixture) => (fixture.expectation.forbiddenItemTitles ?? []).length > 0);

  const falseWriteRate = divide(
    results.filter((result) => result.effectMetrics.hasUnexpectedWrite).length,
    notMemoryCases.length,
  );
  const staleRecallRate = divide(
    results.filter((result) => result.effectMetrics.hasForbiddenRecall).length,
    forbiddenCases.length,
  );
  const missedDurableRecallRate = divide(
    results.filter((result) => !result.effectMetrics.hasExpectedRecall).length,
    recallCases.length,
  );
  const recallHitRate = divide(
    results.filter((result) => {
      const fixture = fixtures.find((candidate) => candidate.id === result.caseId);
      return (fixture?.expectation.recalledItemTitles ?? []).length > 0 && result.effectMetrics.hasExpectedRecall;
    }).length,
    recallCases.length,
    1,
  );

  const classifierLatencies = traces.map((trace) => trace.metrics.classifierLatencyMs);
  const recallLatencies = traces.map((trace) => trace.metrics.recallLatencyMs);
  const preflightLatencies = traces.map((trace) => trace.metrics.preflightLatencyMs);
  const augmentationTokens = traces.map((trace) => trace.metrics.augmentationTokens);
  const augmentationRatios = traces.map((trace) => trace.metrics.augmentationTokenRatio);
  const scannedFiles = traces.map((trace) => trace.metrics.filesScannedPerSync);
  const toolCalls = traces.map((trace) => trace.metrics.toolCallCount);
  const toolReads = traces.map((trace) => trace.metrics.toolReadCount);
  const toolWrites = traces.map((trace) => trace.metrics.toolWriteCount);

  return {
    falseWriteRate,
    staleRecallRate,
    missedDurableRecallRate,
    recallHitRate,
    augmentationTokenRatioP95: percentile(augmentationRatios, 95),
    classifierLatencyMsP50: percentile(classifierLatencies, 50),
    classifierLatencyMsP95: percentile(classifierLatencies, 95),
    recallLatencyMsP50: percentile(recallLatencies, 50),
    recallLatencyMsP95: percentile(recallLatencies, 95),
    preflightLatencyMsP50: percentile(preflightLatencies, 50),
    preflightLatencyMsP95: percentile(preflightLatencies, 95),
    augmentationTokensP50: percentile(augmentationTokens, 50),
    augmentationTokensP95: percentile(augmentationTokens, 95),
    filesScannedPerSyncP95: percentile(scannedFiles, 95),
    toolCallCountP50: percentile(toolCalls, 50),
    toolCallCountP95: percentile(toolCalls, 95),
    toolReadCountP50: percentile(toolReads, 50),
    toolReadCountP95: percentile(toolReads, 95),
    toolWriteCountP50: percentile(toolWrites, 50),
    toolWriteCountP95: percentile(toolWrites, 95),
  };
}

function aggregateMetricsFromReports(
  fixtures: MemoryBenchmarkCase[],
  reports: MemoryBenchmarkSuiteReport[],
): MemoryBenchmarkAggregateMetrics {
  const results = reports.flatMap((report) => report.results);
  const metrics = results.map((result) => result.costMetrics);
  const notMemoryCases = fixtures.filter((fixture) => fixture.expectation.intent === "not_memory");
  const recallCases = fixtures.filter((fixture) => (fixture.expectation.recalledItemTitles ?? []).length > 0);
  const forbiddenCases = fixtures.filter((fixture) => (fixture.expectation.forbiddenItemTitles ?? []).length > 0);

  const falseWriteRate = divide(
    results.filter((result) => result.effectMetrics.hasUnexpectedWrite).length,
    notMemoryCases.length,
  );
  const staleRecallRate = divide(
    results.filter((result) => result.effectMetrics.hasForbiddenRecall).length,
    forbiddenCases.length,
  );
  const missedDurableRecallRate = divide(
    results.filter((result) => !result.effectMetrics.hasExpectedRecall).length,
    recallCases.length,
  );
  const recallHitRate = divide(
    results.filter((result) => {
      const fixture = fixtures.find((candidate) => candidate.id === result.caseId);
      return (fixture?.expectation.recalledItemTitles ?? []).length > 0 && result.effectMetrics.hasExpectedRecall;
    }).length,
    recallCases.length,
    1,
  );

  const classifierLatencies = metrics.map((metric) => metric.classifierLatencyMs);
  const recallLatencies = metrics.map((metric) => metric.recallLatencyMs);
  const preflightLatencies = metrics.map((metric) => metric.preflightLatencyMs);
  const augmentationTokens = metrics.map((metric) => metric.augmentationTokens);
  const augmentationRatios = metrics.map((metric) => metric.augmentationTokenRatio);
  const scannedFiles = metrics.map((metric) => metric.filesScannedPerSync);
  const toolCalls = metrics.map((metric) => metric.toolCallCount);
  const toolReads = metrics.map((metric) => metric.toolReadCount);
  const toolWrites = metrics.map((metric) => metric.toolWriteCount);

  return {
    falseWriteRate,
    staleRecallRate,
    missedDurableRecallRate,
    recallHitRate,
    augmentationTokenRatioP95: percentile(augmentationRatios, 95),
    classifierLatencyMsP50: percentile(classifierLatencies, 50),
    classifierLatencyMsP95: percentile(classifierLatencies, 95),
    recallLatencyMsP50: percentile(recallLatencies, 50),
    recallLatencyMsP95: percentile(recallLatencies, 95),
    preflightLatencyMsP50: percentile(preflightLatencies, 50),
    preflightLatencyMsP95: percentile(preflightLatencies, 95),
    augmentationTokensP50: percentile(augmentationTokens, 50),
    augmentationTokensP95: percentile(augmentationTokens, 95),
    filesScannedPerSyncP95: percentile(scannedFiles, 95),
    toolCallCountP50: percentile(toolCalls, 50),
    toolCallCountP95: percentile(toolCalls, 95),
    toolReadCountP50: percentile(toolReads, 50),
    toolReadCountP95: percentile(toolReads, 95),
    toolWriteCountP50: percentile(toolWrites, 50),
    toolWriteCountP95: percentile(toolWrites, 95),
  };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function divide(numerator: number, denominator: number, fallback = 0): number {
  return denominator === 0 ? fallback : numerator / denominator;
}
