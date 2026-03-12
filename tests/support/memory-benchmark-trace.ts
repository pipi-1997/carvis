import type { OutboundMessage, RunRequest } from "../../packages/core/src/domain/models.ts";
import type {
  MemoryBenchmarkMetrics,
  MemoryBenchmarkSignalSources,
  MemoryBenchmarkSuite,
  MemoryBenchmarkTrace,
} from "../../packages/core/src/domain/memory-benchmark.ts";

type HarnessLike = {
  bridgeRequests: RunRequest[];
  memoryBenchmarkTrace?: {
    bridgeRequests: Array<{
      prompt: string;
      workspace: string;
      sessionMode: string;
    }>;
    memoryWriteObservations?: Array<{
      targetPath: string;
      changeType: "long_term" | "daily";
      changed: boolean;
      summary: string;
    }>;
    manualEditPaths?: string[];
    memoryFlushObservation?: {
      triggered: boolean;
      changed: boolean;
      targetPath: string | null;
      writeCount: number;
    };
    memoryExcerpt?: {
      excerptText: string;
      sources: string[];
      selectedSections: string[];
      approxTokens: number;
    };
    preflightLatencyMs?: number;
    filesScanned?: number;
    userVisibleOutputs: Array<{
      kind: string;
      content: string;
    }>;
  };
  sentMessages: OutboundMessage[];
};

export function createMemoryBenchmarkTrace(input: {
  caseId: string;
  suite: MemoryBenchmarkSuite;
  harness: HarnessLike;
  metrics: MemoryBenchmarkMetrics;
  classification?: MemoryBenchmarkTrace["classification"];
  writes?: string[];
  recalls?: string[];
  runtimeOutcome?: MemoryBenchmarkTrace["runtimeOutcome"];
  signalSources?: MemoryBenchmarkSignalSources;
}): MemoryBenchmarkTrace {
  return {
    caseId: input.caseId,
    suite: input.suite,
    classification: input.classification ?? "not_memory",
    writes: input.writes ?? [],
    recalls: input.recalls ?? [],
    manualEditPaths: input.harness.memoryBenchmarkTrace?.manualEditPaths ?? [],
    memoryWriteObservations: input.harness.memoryBenchmarkTrace?.memoryWriteObservations ?? [],
    memoryFlushObservation: input.harness.memoryBenchmarkTrace?.memoryFlushObservation ?? {
      triggered: false,
      changed: false,
      targetPath: null,
      writeCount: 0,
    },
    memoryExcerpt: input.harness.memoryBenchmarkTrace?.memoryExcerpt ?? {
      excerptText: "",
      sources: [],
      selectedSections: [],
      approxTokens: 0,
    },
    bridgeRequests:
      input.harness.memoryBenchmarkTrace?.bridgeRequests
      ?? input.harness.bridgeRequests.map((request) => ({
        prompt: request.prompt,
        workspace: request.workspace,
        sessionMode: request.sessionMode ?? "fresh",
      })),
    userVisibleOutputs:
      input.harness.memoryBenchmarkTrace?.userVisibleOutputs
      ?? input.harness.sentMessages.map((message) => ({
        kind: message.kind,
        content: message.content,
      })),
    runtimeOutcome: input.runtimeOutcome ?? "completed",
    signalSources: input.signalSources ?? {
      queue: "runtime-reuse",
      lock: "runtime-reuse",
      heartbeat: "test-double",
    },
    metrics: input.metrics,
  };
}
