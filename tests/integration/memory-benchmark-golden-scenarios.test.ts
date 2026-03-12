import { describe, expect, test } from "bun:test";

import { runMemoryBenchmarkSuite } from "../support/memory-benchmark-runner.ts";

describe("memory benchmark golden scenarios", () => {
  test("golden suite includes passing remember and not-memory cases", async () => {
    const report = await runMemoryBenchmarkSuite({
      fixtureRoot: "tests/fixtures/memory-benchmark/l1-golden",
    });

    expect(report.results.map((result) => result.caseId)).toContain("golden-remember-bun");
    expect(report.results.map((result) => result.caseId)).toContain("golden-not-memory-chat");
    expect(report.failedCaseIds).not.toContain("golden-remember-bun");
    expect(report.failedCaseIds).not.toContain("golden-not-memory-chat");
  });
});
