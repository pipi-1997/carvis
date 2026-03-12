import type {
  MemoryBenchmarkAggregateMetrics,
  MemoryBenchmarkGateProfile,
  MemoryBenchmarkRolloutRecommendation,
} from "../../packages/core/src/domain/memory-benchmark.ts";

export function createMemoryBenchmarkGateProfile(): MemoryBenchmarkGateProfile {
  return {
    falseWriteRateMax: 0,
    staleRecallRateMax: 0,
    missedDurableRecallRateMax: 0,
    recallHitRateMin: 0.95,
    augmentationTokenRatioMax: 0.2,
    preflightLatencyMsP95Max: 30,
    filesScannedPerSyncP95Max: 6,
    toolCallCountP95Max: 2,
  };
}

export function evaluateMemoryBenchmarkGates(input: {
  gateProfile: MemoryBenchmarkGateProfile;
  metrics: Pick<
    MemoryBenchmarkAggregateMetrics,
    | "falseWriteRate"
    | "staleRecallRate"
    | "missedDurableRecallRate"
    | "recallHitRate"
    | "augmentationTokenRatioP95"
    | "preflightLatencyMsP95"
    | "filesScannedPerSyncP95"
    | "toolCallCountP95"
  >;
}) {
  const failures: string[] = [];

  if (input.metrics.falseWriteRate > input.gateProfile.falseWriteRateMax) {
    failures.push(`false_write_rate != ${input.gateProfile.falseWriteRateMax}`);
  }
  if (input.metrics.staleRecallRate > input.gateProfile.staleRecallRateMax) {
    failures.push(`stale_recall_rate != ${input.gateProfile.staleRecallRateMax}`);
  }
  if (input.metrics.missedDurableRecallRate > input.gateProfile.missedDurableRecallRateMax) {
    failures.push(`missed_durable_recall_rate != ${input.gateProfile.missedDurableRecallRateMax}`);
  }
  if (input.metrics.recallHitRate < input.gateProfile.recallHitRateMin) {
    failures.push(`recall_hit_rate < ${input.gateProfile.recallHitRateMin.toFixed(2)}`);
  }
  if (input.metrics.augmentationTokenRatioP95 > input.gateProfile.augmentationTokenRatioMax) {
    failures.push(`augmentation_token_ratio_p95 > ${input.gateProfile.augmentationTokenRatioMax.toFixed(2)}`);
  }
  if (input.metrics.preflightLatencyMsP95 > input.gateProfile.preflightLatencyMsP95Max) {
    failures.push(`preflight_latency_ms_p95 > ${input.gateProfile.preflightLatencyMsP95Max}`);
  }
  if (input.metrics.filesScannedPerSyncP95 > input.gateProfile.filesScannedPerSyncP95Max) {
    failures.push(`files_scanned_per_sync_p95 > ${input.gateProfile.filesScannedPerSyncP95Max}`);
  }
  if (input.metrics.toolCallCountP95 > input.gateProfile.toolCallCountP95Max) {
    failures.push(`tool_call_count_p95 > ${input.gateProfile.toolCallCountP95Max}`);
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

export function recommendMemoryBenchmarkRollout(input: {
  passed: boolean;
  hasReplayCoverage: boolean;
}): MemoryBenchmarkRolloutRecommendation {
  if (!input.passed) {
    return "blocked";
  }
  return input.hasReplayCoverage ? "eligible_for_next_phase" : "shadow_only";
}
