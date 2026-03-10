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
