import type { RunRequest } from "./models.ts";

export type MemoryBenchmarkSuite = "L1-golden" | "L2-replay" | "L3-adversarial";
export type MemoryBenchmarkIntent = "remember" | "forget" | "update" | "not_memory";
export type MemoryBenchmarkRuntimeOutcome = "completed" | "failed" | "cancelled";
export type MemoryBenchmarkSignalSource = "runtime-reuse" | "test-double";
export type MemoryBenchmarkRolloutRecommendation = "blocked" | "shadow_only" | "eligible_for_next_phase";

export interface MemoryBenchmarkTurn {
  role: "user" | "system";
  text: string;
  chatId?: string;
  messageId?: string;
  metadata?: Record<string, string>;
}

export interface MemoryBenchmarkExpectation {
  intent?: MemoryBenchmarkIntent;
  expectedWrites?: string[];
  recalledItemTitles?: string[];
  forbiddenItemTitles?: string[];
  gateCritical?: boolean;
}

export interface MemoryBenchmarkCase {
  id: string;
  suite: MemoryBenchmarkSuite;
  workspaceKey: string;
  transcript: MemoryBenchmarkTurn[];
  expectation: MemoryBenchmarkExpectation;
  notes?: string;
}

export interface MemoryBenchmarkMetrics {
  classifierLatencyMs: number;
  recallLatencyMs: number;
  preflightLatencyMs: number;
  augmentationTokens: number;
  augmentationTokenRatio: number;
  filesScannedPerSync: number;
  toolCallCount: number;
  toolReadCount: number;
  toolWriteCount: number;
}

export interface MemoryBenchmarkSignalSources {
  queue: MemoryBenchmarkSignalSource;
  lock: MemoryBenchmarkSignalSource;
  heartbeat: MemoryBenchmarkSignalSource;
}

export interface MemoryBenchmarkTrace {
  caseId: string;
  suite: MemoryBenchmarkSuite;
  classification: MemoryBenchmarkIntent;
  writes: string[];
  recalls: string[];
  manualEditPaths: string[];
  memoryWriteObservations: Array<{
    targetPath: string;
    changeType: "long_term" | "daily";
    changed: boolean;
    summary: string;
  }>;
  memoryFlushObservation: {
    triggered: boolean;
    changed: boolean;
    targetPath: string | null;
    writeCount: number;
  };
  memoryExcerpt: {
    excerptText: string;
    sources: string[];
    selectedSections: string[];
    approxTokens: number;
  };
  bridgeRequests: Array<Pick<RunRequest, "prompt" | "workspace"> & { sessionMode: string }>;
  userVisibleOutputs: Array<{
    kind: string;
    content: string;
  }>;
  runtimeOutcome: MemoryBenchmarkRuntimeOutcome;
  signalSources: MemoryBenchmarkSignalSources;
  metrics: MemoryBenchmarkMetrics;
}

export interface MemoryBenchmarkCaseScore {
  caseId: string;
  suite: MemoryBenchmarkSuite;
  passed: boolean;
  failureReasons: string[];
  effectMetrics: {
    hasExpectedRecall: boolean;
    hasForbiddenRecall: boolean;
    hasUnexpectedWrite: boolean;
  };
  costMetrics: MemoryBenchmarkMetrics;
}

export interface MemoryBenchmarkGateProfile {
  falseWriteRateMax: number;
  staleRecallRateMax: number;
  missedDurableRecallRateMax: number;
  recallHitRateMin: number;
  augmentationTokenRatioMax: number;
  preflightLatencyMsP95Max: number;
  filesScannedPerSyncP95Max: number;
  toolCallCountP95Max: number;
}

export interface MemoryBenchmarkAggregateMetrics {
  falseWriteRate: number;
  staleRecallRate: number;
  missedDurableRecallRate: number;
  recallHitRate: number;
  augmentationTokenRatioP95: number;
  classifierLatencyMsP50: number;
  classifierLatencyMsP95: number;
  recallLatencyMsP50: number;
  recallLatencyMsP95: number;
  preflightLatencyMsP50: number;
  preflightLatencyMsP95: number;
  augmentationTokensP50: number;
  augmentationTokensP95: number;
  filesScannedPerSyncP95: number;
  toolCallCountP50: number;
  toolCallCountP95: number;
  toolReadCountP50: number;
  toolReadCountP95: number;
  toolWriteCountP50: number;
  toolWriteCountP95: number;
}

export interface MemoryBenchmarkGateResult {
  passed: boolean;
  failures: string[];
}

export interface MemoryBenchmarkSuiteReport {
  suite: MemoryBenchmarkSuite;
  caseCount: number;
  passedCaseCount: number;
  failedCaseIds: string[];
  results: MemoryBenchmarkCaseScore[];
  metrics: MemoryBenchmarkAggregateMetrics;
  gate: MemoryBenchmarkGateResult;
}

export interface MemoryBenchmarkAggregateReport {
  suites: MemoryBenchmarkSuite[];
  reports: MemoryBenchmarkSuiteReport[];
  globalMetrics: MemoryBenchmarkAggregateMetrics;
  globalGate: MemoryBenchmarkGateResult;
  rolloutRecommendation: MemoryBenchmarkRolloutRecommendation;
}
