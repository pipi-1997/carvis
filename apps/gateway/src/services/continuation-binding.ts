import type { CodexSandboxMode, ConversationSessionBinding, SessionMode } from "@carvis/core";

export function resolveRequestedSession(input: {
  binding: ConversationSessionBinding | null;
  workspace: string;
  resolvedSandboxMode?: CodexSandboxMode;
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

  if (input.resolvedSandboxMode && input.binding.sandboxMode !== input.resolvedSandboxMode) {
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
