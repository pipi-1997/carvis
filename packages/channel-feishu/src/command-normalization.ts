import type { InboundEnvelope } from "@carvis/core";

type FeishuMention = {
  name?: string;
};

type FeishuCommandEnvelopeFields = Pick<
  InboundEnvelope,
  "command" | "commandArgs" | "prompt" | "rawText" | "unknownCommand"
>;

export function normalizeFeishuCommandText(input: {
  text: string;
  mentions?: FeishuMention[];
}): FeishuCommandEnvelopeFields {
  const normalizedText = normalizeMentionPrefix(
    input.text,
    input.mentions ?? [],
  );
  const parsed = parseCommand(normalizedText);

  return {
    command: parsed.command,
    commandArgs: parsed.commandArgs,
    unknownCommand: parsed.unknownCommand,
    prompt: parsed.command || parsed.unknownCommand || normalizedText.length === 0 ? null : normalizedText,
    rawText: normalizedText,
  };
}

export function normalizeMentionPrefix(
  text: string,
  mentions: FeishuMention[],
): string {
  let normalized = text.trim();
  if (!normalized.startsWith("@")) {
    return normalized;
  }

  let strippedKnownMention = false;
  for (const mention of mentions) {
    if (!mention.name) {
      continue;
    }
    const prefix = `@${mention.name}`;
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length).trim();
      strippedKnownMention = true;
    }
  }

  while (strippedKnownMention && normalized.startsWith("@")) {
    const stripped = normalized.replace(/^@\S+(?:[\s:：,，]+|$)/, "").trim();
    if (stripped === normalized) {
      break;
    }
    normalized = stripped;
  }

  return normalized;
}

function parseCommand(rawText: string): Pick<InboundEnvelope, "command" | "commandArgs"> & {
  unknownCommand: string | null;
} {
  if (!rawText.startsWith("/")) {
    return {
      command: null,
      commandArgs: [],
      unknownCommand: null,
    };
  }

  const [commandToken, ...commandArgs] = rawText.split(/\s+/).filter((part) => part.length > 0);
  const command =
    commandToken === "/status"
      ? "status"
      : commandToken === "/abort"
        ? "abort"
        : commandToken === "/new"
          ? "new"
          : commandToken === "/bind"
            ? "bind"
            : commandToken === "/mode"
              ? "mode"
            : commandToken === "/help"
              ? "help"
              : null;

  return {
    command,
    commandArgs: command ? commandArgs : [],
    unknownCommand: command ? null : commandToken ?? null,
  };
}
