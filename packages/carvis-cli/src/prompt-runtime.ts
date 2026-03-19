import {
  cancel as clackCancel,
  confirm as clackConfirm,
  intro,
  isCancel,
  outro,
  password,
  select as clackSelect,
  spinner,
  text,
} from "@clack/prompts";

import type { OnboardingPrompter } from "./onboarding.ts";

export type PromptFlow = "manual" | "quickstart";

type PromptRuntimeOptions = {
  command: "configure" | "onboard";
  flow?: PromptFlow;
  yes?: boolean;
};

export class PromptCancelledError extends Error {
  constructor(message = "prompt cancelled") {
    super(message);
    this.name = "PromptCancelledError";
  }
}

export function formatPromptNote(
  message: string,
  title?: string,
  options: {
    env?: Record<string, string | undefined>;
    hyperlinkSupported?: boolean;
  } = {},
) {
  const hyperlinkSupported = options.hyperlinkSupported ?? supportsTerminalHyperlinks(options.env);
  const formattedTitle = title ? `${ansi.bold}${ansi.cyan}提示: ${highlightKeywords(title)}${ansi.reset}` : undefined;
  const formattedBody = String(message)
    .split("\n")
    .map((line) => `  ${formatNoteLine(line, hyperlinkSupported)}`);

  return [...(formattedTitle ? [formattedTitle] : []), ...formattedBody].join("\n");
}

export function createClackPrompter(options: PromptRuntimeOptions): OnboardingPrompter & {
  begin(title?: string): void;
  end(message: string): void;
  fail(message: string): never;
  note(message: string, title?: string): void;
  withSpinner<T>(message: string, handler: () => Promise<T>): Promise<T>;
} {
  return {
    begin(title) {
      intro(title ?? `carvis ${options.command}`);
    },
    async confirm(prompt) {
      if (options.yes && prompt.defaultValue !== undefined) {
        return prompt.defaultValue;
      }
      const result = await clackConfirm({
        initialValue: prompt.defaultValue,
        message: prompt.message,
      });
      if (isCancel(result)) {
        throw new PromptCancelledError();
      }
      return result;
    },
    end(message) {
      outro(message);
    },
    fail(message) {
      clackCancel(message);
      throw new PromptCancelledError(message);
    },
    note(message, title) {
      process.stdout.write(`${formatPromptNote(message, title, { env: process.env })}\n\n`);
    },
    async input(prompt) {
      if (options.yes && prompt.defaultValue !== undefined) {
        return prompt.defaultValue;
      }
      const promptImpl = prompt.secret ? password : text;
      const result = await promptImpl({
        initialValue: prompt.defaultValue,
        message: prompt.message,
        placeholder: prompt.defaultValue,
      });
      if (isCancel(result)) {
        throw new PromptCancelledError();
      }
      return String(result ?? prompt.defaultValue ?? "");
    },
    async select(prompt) {
      if (options.yes && prompt.defaultValue !== undefined) {
        return prompt.defaultValue;
      }
      const result = await clackSelect({
        initialValue: prompt.defaultValue,
        message: prompt.message,
        options: prompt.options.map((value) => ({
          label: value,
          value,
        })),
      });
      if (isCancel(result)) {
        throw new PromptCancelledError();
      }
      return String(result ?? prompt.defaultValue ?? prompt.options[0] ?? "");
    },
    async withSpinner(message, handler) {
      const promptSpinner = spinner();
      promptSpinner.start(message);
      try {
        const result = await handler();
        promptSpinner.stop(message);
        return result;
      } catch (error) {
        promptSpinner.stop(error instanceof Error ? error.message : String(error), 1);
        throw error;
      }
    },
  };
}

const ansi = {
  bold: "\u001b[1m",
  cyan: "\u001b[36m",
  reset: "\u001b[0m",
  underline: "\u001b[4m",
  yellow: "\u001b[33m",
};

function formatNoteLine(line: string, hyperlinkSupported: boolean) {
  return hyperlinkify(highlightKeywords(line), hyperlinkSupported);
}

function highlightKeywords(line: string) {
  return line
    .replace(/\b(FEISHU_APP_ID|FEISHU_APP_SECRET)\b/g, `${ansi.bold}${ansi.yellow}$1${ansi.reset}`)
    .replace(/\b(App ID|App Secret|chat_id|allowFrom|requireMention)\b/g, `${ansi.bold}$1${ansi.reset}`);
}

function hyperlinkify(line: string, hyperlinkSupported: boolean) {
  return line.replace(/https?:\/\/[^\s]+/g, (url) => {
    if (!hyperlinkSupported) {
      return `${ansi.underline}${url}${ansi.reset}`;
    }
    return `\u001b]8;;${url}\u0007${ansi.underline}${url}${ansi.reset}\u001b]8;;\u0007`;
  });
}

function supportsTerminalHyperlinks(env: Record<string, string | undefined> = process.env) {
  if (env.FORCE_HYPERLINK === "1") {
    return true;
  }
  if (env.TERM === "dumb" || env.NO_COLOR === "1") {
    return false;
  }
  return Boolean(
    env.WT_SESSION
      || env.TERM_PROGRAM === "iTerm.app"
      || env.TERM_PROGRAM === "WezTerm"
      || env.VTE_VERSION
      || env.KONSOLE_VERSION,
  );
}
