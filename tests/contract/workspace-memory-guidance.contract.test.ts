import { describe, expect, test } from "bun:test";

import { buildWorkspaceMemoryGuidance } from "../../apps/executor/src/services/workspace-memory-guidance.ts";

describe("workspace memory guidance contract", () => {
  test("guidance defines long-term path, daily path, and reject-write rules", () => {
    const guidance = buildWorkspaceMemoryGuidance();

    expect(guidance.guidanceText).toContain("Long-term memory path: .carvis/MEMORY.md");
    expect(guidance.guidanceText).toContain("Daily memory path: .carvis/memory/YYYY-MM-DD.md");
    expect(guidance.guidanceText).toContain("Do not persist transient, emotional, or one-off chatter.");
    expect(guidance.guidanceText).toContain("deduplicate or supersede conflicting active facts");
  });
});
