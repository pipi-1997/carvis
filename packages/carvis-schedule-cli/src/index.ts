import {
  createCarvisScheduleGatewayClient,
  type CarvisScheduleGatewayClient,
  type FetchLike,
} from "./gateway-client.ts";
import { parseCarvisScheduleCommand } from "./command-parser.ts";

type CliResult = {
  status: "executed" | "needs_clarification" | "rejected" | "failed";
  reason: string | null;
  question?: string | null;
  targetDefinitionId: string | null;
  summary: string;
};

export { parseCarvisScheduleCommand } from "./command-parser.ts";
export { createCarvisScheduleGatewayClient } from "./gateway-client.ts";

export async function runCarvisScheduleCli(
  argv: string[],
  input?: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    fetchImpl?: FetchLike;
    gatewayClient?: CarvisScheduleGatewayClient;
    socketPath?: string;
    stdout?(text: string): void;
    stderr?(text: string): void;
  },
): Promise<number> {
  const stdout = input?.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));
  const stderr = input?.stderr ?? ((text: string) => process.stderr.write(`${text}\n`));

  if (argv.includes("--help") || argv.includes("-h") || argv.length === 0) {
    stdout(buildHelpText());
    return 0;
  }

  const parsed = parseCarvisScheduleCommand(argv, {
    cwd: input?.cwd,
    env: input?.env,
  });
  if (!parsed.ok) {
    stdout(JSON.stringify(parsed.result));
    return 3;
  }

  const gatewayClient = input?.gatewayClient ?? createCarvisScheduleGatewayClient({
    env: input?.env,
    fetchImpl: input?.fetchImpl,
    socketPath: input?.socketPath,
  });

  try {
    const result = await gatewayClient.execute(parsed.command);
    stdout(JSON.stringify(result));
    return mapExitCode(result.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(message);
    const result: CliResult = {
      status: "failed",
      reason: "transport_failure",
      targetDefinitionId: null,
      summary: message,
    };
    stdout(JSON.stringify(result));
    return 4;
  }
}

function mapExitCode(status: "executed" | "needs_clarification" | "rejected") {
  switch (status) {
    case "executed":
      return 0;
    case "needs_clarification":
      return 2;
    case "rejected":
      return 3;
  }
}

function buildHelpText() {
  return [
    "carvis-schedule <create|list|update|disable> [flags]",
    "",
    "Runtime context is resolved internally from the current Codex session.",
    "Explicit debug flags are optional: --gateway-base-url --workspace --session-id --chat-id --requested-text --user-id",
    "",
    "Examples:",
    "  carvis-schedule list",
    "  carvis-schedule create --label 提醒 --schedule-expr '0 9 12 3 *' --prompt-template 'real chat verify'",
    "  carvis-schedule update --target-reference 日报 --schedule-expr '0 10 * * *'",
  ].join("\n");
}
