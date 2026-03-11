import type { EffectiveManagedSchedule } from "@carvis/core";

export function createScheduleDefinitionMatcher() {
  return {
    match(input: {
      definitions: EffectiveManagedSchedule[];
      definitionId?: string | null;
      targetReference?: string | null;
    }) {
      if (input.definitionId) {
        const exact = input.definitions.find((definition) => definition.definitionId === input.definitionId);
        return exact ? { status: "matched" as const, definition: exact } : { status: "not_found" as const };
      }

      const reference = input.targetReference?.trim();
      if (!reference) {
        return { status: "not_found" as const };
      }

      const normalized = reference.toLowerCase();
      const matches = input.definitions.filter((definition) => {
        return (
          definition.label.toLowerCase().includes(normalized)
          || definition.promptTemplate.toLowerCase().includes(normalized)
          || (definition.scheduleExpr ?? "").toLowerCase().includes(normalized)
        );
      });

      if (matches.length === 1) {
        return { status: "matched" as const, definition: matches[0]! };
      }
      if (matches.length > 1) {
        return {
          status: "ambiguous" as const,
          definitions: matches.map((definition) => ({
            definitionId: definition.definitionId,
            label: definition.label,
          })),
        };
      }
      return { status: "not_found" as const };
    },
  };
}
