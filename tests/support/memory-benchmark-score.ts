import type {
  MemoryBenchmarkCase,
  MemoryBenchmarkCaseScore,
  MemoryBenchmarkTrace,
} from "../../packages/core/src/domain/memory-benchmark.ts";

export function scoreMemoryBenchmarkCase(input: {
  fixture: MemoryBenchmarkCase;
  trace: MemoryBenchmarkTrace;
}): MemoryBenchmarkCaseScore {
  const failureReasons: string[] = [];
  const expectedRecalls = input.fixture.expectation.recalledItemTitles ?? [];
  const forbiddenRecalls = input.fixture.expectation.forbiddenItemTitles ?? [];
  const expectedWrites = input.fixture.expectation.expectedWrites ?? [];

  for (const recalled of expectedRecalls) {
    if (!input.trace.recalls.includes(recalled)) {
      failureReasons.push(`missing recall: ${recalled}`);
    }
  }

  for (const forbidden of forbiddenRecalls) {
    if (input.trace.recalls.includes(forbidden)) {
      failureReasons.push(`forbidden recall: ${forbidden}`);
    }
  }

  if (input.fixture.expectation.intent && input.trace.classification !== input.fixture.expectation.intent) {
    failureReasons.push(`intent mismatch: expected ${input.fixture.expectation.intent}, got ${input.trace.classification}`);
  }

  if (
    input.fixture.expectation.intent
    && input.fixture.expectation.intent !== "not_memory"
    && input.trace.classification === "not_memory"
    && input.trace.writes.length === 0
    && input.trace.recalls.length === 0
  ) {
    failureReasons.push("memory feature unavailable");
  }

  if (input.fixture.expectation.intent === "not_memory" && input.trace.writes.length > 0) {
    failureReasons.push("unexpected durable write");
  }

  for (const expectedWrite of expectedWrites) {
    if (!input.trace.writes.includes(expectedWrite)) {
      failureReasons.push(`missing write: ${expectedWrite}`);
    }
  }

  return {
    caseId: input.fixture.id,
    suite: input.fixture.suite,
    passed: failureReasons.length === 0,
    failureReasons,
    effectMetrics: {
      hasExpectedRecall: expectedRecalls.every((item) => input.trace.recalls.includes(item)),
      hasForbiddenRecall: forbiddenRecalls.some((item) => input.trace.recalls.includes(item)),
      hasUnexpectedWrite: input.fixture.expectation.intent === "not_memory" && input.trace.writes.length > 0,
    },
    costMetrics: input.trace.metrics,
  };
}
