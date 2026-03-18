import type { MediaToolInvocation } from "@carvis/core";

export type ParsedCarvisMediaCommand =
  | {
      ok: true;
      command: {
        actionType: MediaToolInvocation["actionType"];
        gatewayBaseUrl: string | null;
        workspace: string;
        runId: string;
        sessionId: string;
        chatId: string;
        userId: string | null;
        requestedText: string;
        invocation: MediaToolInvocation;
      };
    }
  | {
      ok: false;
      result: {
        status: "rejected";
        reason: string;
        mediaDeliveryId: null;
        targetRef: null;
        summary: string;
      };
    };

export function parseCarvisMediaCommand(
  argv: string[],
  options: {
    cwd?: string;
    env?: Record<string, string | undefined>;
  } = {},
): ParsedCarvisMediaCommand {
  const [actionType, ...rest] = argv;
  if (actionType !== "send") {
    return reject("invalid_command", "用法错误：需要 send 子命令。");
  }

  const env = options.env ?? process.env;
  const flags = parseFlags(rest, env);
  const context = resolveRuntimeContext(flags, {
    cwd: options.cwd ?? process.cwd(),
    env,
  });

  for (const [field, value] of Object.entries(context.required)) {
    if (!value) {
      return reject("missing_transport", `当前会话内的资源发送能力不可用：缺少运行时上下文 ${field}。`);
    }
  }

  const path = flags["--path"];
  const url = flags["--url"];
  if (!path && !url) {
    return reject("missing_source", "send 需要 --path 或 --url。");
  }
  if (path && url) {
    return reject("multiple_sources", "send 一次只能发送一个资源，请只传 --path 或 --url。");
  }

  const invocation: MediaToolInvocation = {
    actionType: "send",
    sourceType: path ? "local_path" : "remote_url",
    ...(path ? { path } : {}),
    ...(url ? { url } : {}),
    ...(flags["--media-kind"] ? { mediaKind: flags["--media-kind"] as MediaToolInvocation["mediaKind"] } : {}),
    ...(flags["--title"] ? { title: flags["--title"] } : {}),
    ...(flags["--caption"] ? { caption: flags["--caption"] } : {}),
  };

  return {
    ok: true,
    command: {
      actionType: "send",
      gatewayBaseUrl: context.gatewayBaseUrl,
      workspace: context.workspace,
      runId: context.required.runId!,
      sessionId: context.required.sessionId!,
      chatId: context.required.chatId!,
      userId: context.userId,
      requestedText: context.required.requestedText!,
      invocation,
    },
  };
}

function parseFlags(argv: string[], env: Record<string, string | undefined>) {
  const result: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[token] = "";
      continue;
    }
    result[token] = expandEnvReference(next, env);
    index += 1;
  }
  return result;
}

function expandEnvReference(value: string, env: Record<string, string | undefined>) {
  const directMatch = /^\$([A-Z0-9_]+)$/i.exec(value);
  if (directMatch) {
    return env[directMatch[1]] ?? value;
  }

  const bracedMatch = /^\$\{([A-Z0-9_]+)\}$/i.exec(value);
  if (bracedMatch) {
    return env[bracedMatch[1]] ?? value;
  }

  return value;
}

function resolveRuntimeContext(
  flags: Record<string, string>,
  input: {
    cwd: string;
    env: Record<string, string | undefined>;
  },
) {
  return {
    gatewayBaseUrl: flags["--gateway-base-url"] || input.env.CARVIS_GATEWAY_BASE_URL || null,
    required: {
      runId: flags["--run-id"] || input.env.CARVIS_RUN_ID || null,
      sessionId: flags["--session-id"] || input.env.CARVIS_SESSION_ID || null,
      chatId: flags["--chat-id"] || input.env.CARVIS_CHAT_ID || null,
      requestedText: flags["--requested-text"] || input.env.CARVIS_REQUESTED_TEXT || null,
    },
    workspace: flags["--workspace"] || input.env.CARVIS_WORKSPACE || input.cwd,
    userId: flags["--user-id"] || input.env.CARVIS_USER_ID || null,
  };
}

function reject(reason: string, summary: string): ParsedCarvisMediaCommand {
  return {
    ok: false,
    result: {
      status: "rejected",
      reason,
      mediaDeliveryId: null,
      targetRef: null,
      summary,
    },
  };
}
