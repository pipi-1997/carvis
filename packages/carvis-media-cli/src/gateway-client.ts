import { randomUUID } from "node:crypto";

import { resolveScheduleManagementSocketPath, type MediaToolInvocation, type MediaToolResult } from "@carvis/core";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response> | Response;

export type CarvisMediaGatewayClient = {
  execute(input: {
    actionType: MediaToolInvocation["actionType"];
    gatewayBaseUrl: string | null;
    workspace: string;
    runId: string;
    sessionId: string;
    chatId: string;
    userId: string | null;
    requestedText: string;
    invocation: MediaToolInvocation;
  }): Promise<MediaToolResult>;
};

export class CarvisMediaGatewayClientError extends Error {
  override readonly cause?: unknown;
  readonly status?: number;

  constructor(message: string, options?: { cause?: unknown; status?: number }) {
    super(message);
    this.name = "CarvisMediaGatewayClientError";
    this.cause = options?.cause;
    this.status = options?.status;
  }
}

export function createCarvisMediaGatewayClient(input?: {
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): CarvisMediaGatewayClient {
  return {
    async execute(request) {
      const fetchImpl = input?.fetchImpl ?? fetch;
      if (!fetchImpl) {
        throw new CarvisMediaGatewayClientError(
          `gateway request failed: missing fetch implementation for ${resolveScheduleManagementSocketPath(input?.env ?? process.env)}`,
        );
      }
      return executeOverHttp(fetchImpl, request);
    },
  };
}

async function executeOverHttp(
  fetchImpl: FetchLike,
  request: Parameters<CarvisMediaGatewayClient["execute"]>[0],
) {
  if (!request.gatewayBaseUrl) {
    throw new CarvisMediaGatewayClientError("gateway request failed: missing gateway base url");
  }

  let response: Response;
  try {
    response = await fetchImpl(`${request.gatewayBaseUrl}/internal/run-tools/execute`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        requestId: randomUUID(),
        toolName: "media.send",
        runId: request.runId,
        invocation: request.invocation,
        workspace: request.workspace,
        sessionId: request.sessionId,
        chatId: request.chatId,
        userId: request.userId,
        requestedText: request.requestedText,
      }),
    });
  } catch (error) {
    throw new CarvisMediaGatewayClientError(
      `gateway request failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new CarvisMediaGatewayClientError(`gateway request failed: ${response.status}`, {
      status: response.status,
    });
  }

  let payload: { ok: boolean; result: MediaToolResult };
  try {
    payload = await response.json() as { ok: boolean; result: MediaToolResult };
  } catch (error) {
    throw new CarvisMediaGatewayClientError("gateway request failed: invalid json", {
      cause: error,
    });
  }

  return payload.result;
}
