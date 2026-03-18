import type { Run, ScheduleToolInvocation } from "@carvis/core";

export class GatewayToolClientError extends Error {
  readonly failureCode = "mcp_tool_call_failed";
  override readonly cause?: unknown;
  readonly status?: number;

  constructor(message: string | number, options?: { cause?: unknown; status?: number }) {
    const resolvedMessage = typeof message === "number" ? `gateway tool call failed: ${message}` : message;
    super(resolvedMessage);
    this.name = "GatewayToolClientError";
    this.cause = options?.cause;
    this.status = options?.status ?? (typeof message === "number" ? message : undefined);
  }

  static fromStatus(status: number) {
    return new GatewayToolClientError(`gateway tool call failed: ${status}`, { status });
  }

  static fromUnexpected(error: unknown, context = "gateway tool call failed") {
    if (error instanceof GatewayToolClientError) {
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new GatewayToolClientError(`${context}: ${message}`, { cause: error });
  }
}

export function createGatewayToolClient(input: {
  baseUrl: string;
}) {
  return {
    async execute(args: {
      run: Run;
      session: { chatId: string; id: string } | null;
      toolName: string;
      arguments: Record<string, unknown>;
    }): Promise<Record<string, unknown>> {
      let response: Response;
      try {
        response = await fetch(`${input.baseUrl}/internal/run-tools/execute`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            runId: args.run.id,
            toolName: args.toolName,
            invocation: args.arguments as unknown as ScheduleToolInvocation,
            workspace: args.run.workspace,
            sessionId: args.session?.id ?? "",
            chatId: args.session?.chatId ?? "",
            userId: args.run.triggerUserId,
            requestedText: args.run.prompt,
          }),
        });
      } catch (error) {
        throw GatewayToolClientError.fromUnexpected(error);
      }

      if (!response.ok) {
        throw GatewayToolClientError.fromStatus(response.status);
      }

      let payload: { result: Record<string, unknown> };
      try {
        payload = await response.json() as {
          result: Record<string, unknown>;
        };
      } catch (error) {
        throw GatewayToolClientError.fromUnexpected(error, "gateway tool call returned invalid json");
      }
      return payload.result;
    },
  };
}
