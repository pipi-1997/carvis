import {
  createCarvisMediaGatewayClient,
  type CarvisMediaGatewayClient,
  type FetchLike,
} from "./gateway-client.ts";
import { parseCarvisMediaCommand } from "./command-parser.ts";

type CliResult = {
  status: "sent" | "rejected" | "failed";
  reason: string | null;
  mediaDeliveryId: string | null;
  targetRef: string | null;
  summary: string;
};

export { parseCarvisMediaCommand } from "./command-parser.ts";
export { createCarvisMediaGatewayClient } from "./gateway-client.ts";

export async function runCarvisMediaCli(
  argv: string[],
  input?: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    fetchImpl?: FetchLike;
    gatewayClient?: CarvisMediaGatewayClient;
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

  const parsed = parseCarvisMediaCommand(argv, {
    cwd: input?.cwd,
    env: input?.env,
  });
  if (!parsed.ok) {
    stdout(JSON.stringify(parsed.result));
    return 3;
  }

  const gatewayClient = input?.gatewayClient ?? createCarvisMediaGatewayClient({
    env: input?.env,
    fetchImpl: input?.fetchImpl,
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
      mediaDeliveryId: null,
      targetRef: null,
      summary: message,
    };
    stdout(JSON.stringify(result));
    return 4;
  }
}

function mapExitCode(status: "sent" | "rejected" | "failed") {
  switch (status) {
    case "sent":
      return 0;
    case "rejected":
      return 3;
    case "failed":
      return 4;
  }
}

function buildHelpText() {
  return [
    "carvis-media <send> [flags]",
    "",
    "Normal use only needs business arguments such as --path, --url, --media-kind, --title, and --caption.",
    "Debug flags are only for transport troubleshooting: --gateway-base-url --workspace --run-id --session-id --chat-id --requested-text --user-id",
    "If required transport context is missing, the command returns a structured failure instead of guessing.",
    "",
    "Examples:",
    "  carvis-media send --path ./output.png --media-kind image",
    "  carvis-media send --url https://example.com/report.pdf --media-kind file",
  ].join("\n");
}
