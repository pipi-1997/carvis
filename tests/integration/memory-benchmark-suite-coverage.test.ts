import { describe, expect, test } from "bun:test";

import { runAllMemoryBenchmarkSuites } from "../support/memory-benchmark-runner.ts";

describe("memory benchmark suite coverage", () => {
  test("loads replay and adversarial stress fixtures into aggregate report", async () => {
    const report = await runAllMemoryBenchmarkSuites();
    const replayReport = report.reports.find((candidate) => candidate.suite === "L2-replay");
    const adversarialReport = report.reports.find((candidate) => candidate.suite === "L3-adversarial");

    expect(report.suites).toContain("L2-replay");
    expect(report.suites).toContain("L3-adversarial");
    expect(replayReport?.results.map((result) => result.caseId)).toContain("replay-repeated-recall-session");
    expect(replayReport?.results.map((result) => result.caseId)).toContain("replay-large-curated-memory");
    expect(adversarialReport?.results.map((result) => result.caseId)).toContain("adversarial-tool-retry-read-session");
  });
});
