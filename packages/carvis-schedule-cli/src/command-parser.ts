import type { ScheduleToolInvocation, TriggerDeliveryTarget } from "@carvis/core";

export type ParsedCarvisScheduleCommand =
  | {
      ok: true;
      command: {
        actionType: ScheduleToolInvocation["actionType"];
        gatewayBaseUrl: string | null;
        workspace: string;
        sessionId: string;
        chatId: string;
        userId: string | null;
        requestedText: string;
        invocation: ScheduleToolInvocation;
      };
    }
  | {
      ok: false;
      result: {
        status: "rejected";
        reason: string;
        targetDefinitionId: null;
        summary: string;
      };
    };

type MutableInvocation = Partial<ScheduleToolInvocation> & {
  actionType: ScheduleToolInvocation["actionType"];
};

const ACTIONS = new Set(["create", "list", "update", "disable", "enable"]);

export function parseCarvisScheduleCommand(
  argv: string[],
  options: {
    cwd?: string;
    env?: Record<string, string | undefined>;
  } = {},
): ParsedCarvisScheduleCommand {
  const [actionType, ...rest] = argv;
  if (!actionType || !ACTIONS.has(actionType)) {
    return reject("invalid_command", "用法错误：需要 create、list、update、disable 或 enable 子命令。");
  }

  const env = options.env ?? process.env;
  const flags = parseFlags(rest, env);
  const context = resolveRuntimeContext(flags, {
    cwd: options.cwd ?? process.cwd(),
    env,
  });

  for (const [field, value] of Object.entries(context.required)) {
    if (!value) {
      return reject("missing_context", `缺少运行时上下文：${field}`);
    }
  }

  const invocation: MutableInvocation = {
    actionType: actionType as ScheduleToolInvocation["actionType"],
  };

  assignIfPresent(invocation, "label", flags["--label"]);
  assignIfPresent(invocation, "scheduleExpr", flags["--schedule-expr"]);
  assignIfPresent(invocation, "timezone", flags["--timezone"]);
  assignIfPresent(invocation, "promptTemplate", flags["--prompt-template"]);
  assignIfPresent(invocation, "targetReference", flags["--target-reference"]);
  assignIfPresent(invocation, "definitionId", flags["--definition-id"]);

  const deliveryKind = flags["--delivery-kind"];
  if (deliveryKind && deliveryKind !== "none" && deliveryKind !== "feishu_chat") {
    return reject("invalid_delivery_kind", `不支持的 delivery kind：${deliveryKind}。可选值：none、feishu_chat。`);
  }

  const deliveryTarget = parseDeliveryTarget(flags);
  if (deliveryTarget) {
    invocation.deliveryTarget = deliveryTarget;
  }

  if (actionType === "create") {
    for (const flag of ["--label", "--schedule-expr"] as const) {
      if (!flags[flag]) {
        return reject("missing_field", `create 缺少必填参数：${flag}`);
      }
    }
  }

  if ((actionType === "update" || actionType === "disable" || actionType === "enable") && !flags["--target-reference"] && !flags["--definition-id"]) {
    return reject("missing_target", `${actionType} 需要 --target-reference 或 --definition-id。`);
  }

  return {
    ok: true,
    command: {
      actionType: actionType as ScheduleToolInvocation["actionType"],
      gatewayBaseUrl: context.gatewayBaseUrl,
      workspace: context.workspace,
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
      sessionId: flags["--session-id"] || input.env.CARVIS_SESSION_ID || null,
      chatId: flags["--chat-id"] || input.env.CARVIS_CHAT_ID || null,
      requestedText: flags["--requested-text"] || input.env.CARVIS_REQUESTED_TEXT || null,
    },
    workspace: flags["--workspace"] || input.env.CARVIS_WORKSPACE || input.cwd,
    userId: flags["--user-id"] || input.env.CARVIS_USER_ID || null,
  };
}

function parseDeliveryTarget(flags: Record<string, string>): TriggerDeliveryTarget | null {
  const deliveryKind = flags["--delivery-kind"];
  if (!deliveryKind) {
    return null;
  }
  return {
    kind: deliveryKind as TriggerDeliveryTarget["kind"],
    chatId: flags["--delivery-chat-id"] ?? null,
    label: flags["--delivery-label"] ?? null,
  };
}

function assignIfPresent(
  target: MutableInvocation,
  key: keyof ScheduleToolInvocation,
  value: string | undefined,
) {
  if (value !== undefined && value !== "") {
    (target as Record<string, unknown>)[key] = value;
  }
}

function reject(reason: string, summary: string): ParsedCarvisScheduleCommand {
  return {
    ok: false,
    result: {
      status: "rejected",
      reason,
      targetDefinitionId: null,
      summary,
    },
  };
}
