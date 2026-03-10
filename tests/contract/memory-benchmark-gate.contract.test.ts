import { describe, expect, test } from "bun:test";

import { recommendMemoryBenchmarkRollout } from "../support/memory-benchmark-gates.ts";

describe("memory benchmark gate contract", () => {
  test("rollout recommendation resolves to known states", () => {
    expect(recommendMemoryBenchmarkRollout({ passed: true, hasReplayCoverage: false })).toBe("shadow_only");
    expect(recommendMemoryBenchmarkRollout({ passed: true, hasReplayCoverage: true })).toBe("eligible_for_next_phase");
    expect(recommendMemoryBenchmarkRollout({ passed: false, hasReplayCoverage: true })).toBe("blocked");
  });
});
