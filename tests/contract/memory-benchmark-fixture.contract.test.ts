import { describe, expect, test } from "bun:test";

import { loadMemoryBenchmarkFixtures } from "../support/memory-benchmark-fixtures.ts";

describe("memory benchmark fixture contract", () => {
  test("fixture files contain required top-level fields", async () => {
    const fixtures = await loadMemoryBenchmarkFixtures("tests/fixtures/memory-benchmark/l1-golden");

    for (const fixture of fixtures) {
      expect(fixture.id.length).toBeGreaterThan(0);
      expect(fixture.workspaceKey.length).toBeGreaterThan(0);
      expect(fixture.transcript.length).toBeGreaterThan(0);
      expect(fixture.expectation).toBeDefined();
    }
  });
});
