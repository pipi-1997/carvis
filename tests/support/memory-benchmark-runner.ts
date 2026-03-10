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
  const allTraces = reports.flatMap((report) => report.results.map((result) => result.costMetrics));
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
  const harness = createHarness();
  const startedAt = Date.now();

  for (const turn of fixture.transcript) {
    await harness.postFeishuText(turn.text, {
      chat_id: turn.chatId ?? `chat-${fixture.id}`,
      message_id: turn.messageId ?? `${fixture.id}-${Math.random()}`,
    });
    await harness.executor.processNext();
  }

  const metrics = buildObservedMetrics(startedAt);
  const trace = createMemoryBenchmarkTrace({
    caseId: fixture.id,
    suite: fixture.suite,
    harness,
    classification: "not_memory",
    writes: [],
    recalls: [],
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

function buildObservedMetrics(startedAt: number): MemoryBenchmarkMetrics {
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  return {
    classifierLatencyMs: 0,
    recallLatencyMs: 0,
    preflightLatencyMs: elapsedMs,
    augmentationTokens: 0,
    augmentationTokenRatio: 0,
    filesScannedPerSync: 0,
  };
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
