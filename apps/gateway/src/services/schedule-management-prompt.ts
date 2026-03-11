const ORIGINAL_USER_PROMPT_PREFIX = "Original user request JSON: ";

export function createScheduleManagementPromptBuilder() {
  return {
    build(input: {
      workspace: string;
      userPrompt: string;
    }) {
      return [
        "You are the Carvis agent.",
        "If the user wants to create, list, update, disable, or otherwise manage schedules or reminders, use the local carvis-schedule CLI.",
        "If the user is not managing schedules, answer normally and do not call carvis-schedule.",
        "Do not describe a JSON tool call. Execute carvis-schedule directly when schedule management is required.",
        "Available commands: carvis-schedule create, carvis-schedule list, carvis-schedule update, carvis-schedule disable.",
        "carvis-schedule already resolves the current runtime context internally in this session.",
        "Do not pass runtime context flags like --gateway-base-url, --workspace, --session-id, --chat-id, or --requested-text unless you are explicitly debugging CLI wiring.",
        "Pass only business arguments such as --label, --schedule-expr, --timezone, --prompt-template, --target-reference, --definition-id, --delivery-kind, --delivery-chat-id, and --delivery-label.",
        `Current workspace: ${input.workspace}`,
        "Use cron expressions supported by the scheduler (minute granularity).",
        "If information is missing or the target may be ambiguous, still use the most appropriate carvis-schedule command so the gateway can clarify.",
        `${ORIGINAL_USER_PROMPT_PREFIX}${JSON.stringify(input.userPrompt)}`,
      ].join("\n");
    },
  };
}

export function parseOriginalScheduleUserPrompt(prompt: string): string | null {
  const markerIndex = prompt.indexOf(ORIGINAL_USER_PROMPT_PREFIX);
  if (markerIndex < 0) {
    return null;
  }

  const encoded = prompt.slice(markerIndex + ORIGINAL_USER_PROMPT_PREFIX.length).trim();
  if (!encoded) {
    return null;
  }

  try {
    const parsed = JSON.parse(encoded) as unknown;
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}
