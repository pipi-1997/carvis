import type { ConversationSessionBinding, SessionMode } from "@carvis/core";

export function resolveRequestedSession(input: {
  binding: ConversationSessionBinding | null;
  workspace: string;
}): {
  requestedSessionMode: SessionMode;
  requestedBridgeSessionId: string | null;
} {
  if (!input.binding?.bridgeSessionId) {
    return {
      requestedSessionMode: "fresh",
      requestedBridgeSessionId: null,
    };
  }

  if (input.binding.workspace !== input.workspace) {
    return {
      requestedSessionMode: "fresh",
      requestedBridgeSessionId: null,
    };
  }

  return {
    requestedSessionMode: "continuation",
    requestedBridgeSessionId: input.binding.bridgeSessionId,
  };
}
