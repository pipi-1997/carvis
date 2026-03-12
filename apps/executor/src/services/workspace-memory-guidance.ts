import type { WorkspaceMemoryExcerpt } from "./workspace-memory.ts";

export type WorkspaceMemoryGuidance = {
  guidanceText: string;
  promptPrefix: string;
};

export function buildWorkspaceMemoryGuidance(input?: {
  excerpt?: WorkspaceMemoryExcerpt | null;
}): WorkspaceMemoryGuidance {
  const lines = [
    "## Workspace Memory",
    "You may update workspace memory files when the user states a stable preference, decision, or enduring fact.",
    "Long-term memory path: .carvis/MEMORY.md",
    "Daily memory path: .carvis/memory/YYYY-MM-DD.md",
    "Write long-term stable facts to MEMORY.md.",
    "Write recent session context or same-day notes to the daily memory file.",
    "Do not persist transient, emotional, or one-off chatter.",
    "If updating memory, deduplicate or supersede conflicting active facts instead of appending contradictions.",
  ];

  const excerpt = input?.excerpt?.excerptText?.trim();
  if (excerpt) {
    lines.push("", "### Recalled Memory", excerpt);
  }

  const guidanceText = lines.join("\n");
  return {
    guidanceText,
    promptPrefix: `${guidanceText}\n\n---\n\n`,
  };
}
