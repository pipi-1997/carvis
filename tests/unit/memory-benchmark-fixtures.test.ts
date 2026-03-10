import { describe, expect, test } from "bun:test";

import { loadMemoryBenchmarkFixtures } from "../support/memory-benchmark-fixtures.ts";

describe("memory benchmark fixtures", () => {
  test("loads fixture files into typed benchmark cases", async () => {
    const fixtures = await loadMemoryBenchmarkFixtures("tests/fixtures/memory-benchmark/l1-golden");

    expect(fixtures.length).toBeGreaterThan(0);
    expect(fixtures.map((fixture) => fixture.id)).toContain("golden-remember-bun");
  });
});
