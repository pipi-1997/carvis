import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { resolveScheduleManagementSocketPath, type ScheduleToolInvocation, type ScheduleToolResult } from "@carvis/core";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response> | Response;

export type CarvisScheduleGatewayClient = {
  execute(input: {
    actionType: ScheduleToolInvocation["actionType"];
    gatewayBaseUrl: string | null;
    workspace: string;
    sessionId: string;
    chatId: string;
    userId: string | null;
    requestedText: string;
    invocation: ScheduleToolInvocation;
  }): Promise<ScheduleToolResult>;
};

export class CarvisScheduleGatewayClientError extends Error {
  override readonly cause?: unknown;
  readonly status?: number;

  constructor(message: string, options?: { cause?: unknown; status?: number }) {
    super(message);
    this.name = "CarvisScheduleGatewayClientError";
    this.cause = options?.cause;
    this.status = options?.status;
  }
}

export function createCarvisScheduleGatewayClient(input?: {
  env?: Record<string, string | undefined>;
  fetchImpl?: FetchLike;
  socketPath?: string;
  timeoutMs?: number;
}): CarvisScheduleGatewayClient {
  return {
    async execute(request) {
      if (input?.fetchImpl) {
        return executeOverHttp(input.fetchImpl, request);
      }

      const queueRoot = input?.socketPath ?? resolveScheduleManagementSocketPath(input?.env ?? process.env);
      return executeOverQueue(queueRoot, request, input?.timeoutMs ?? 10_000);
    },
  };
}

async function executeOverHttp(
  fetchImpl: FetchLike,
  request: Parameters<CarvisScheduleGatewayClient["execute"]>[0],
) {
  if (!request.gatewayBaseUrl) {
    throw new CarvisScheduleGatewayClientError("gateway request failed: missing gateway base url");
  }

  let response: Response;
  try {
    response = await fetchImpl(`${request.gatewayBaseUrl}/internal/run-tools/execute`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(toGatewayPayload(request)),
    });
  } catch (error) {
    throw new CarvisScheduleGatewayClientError(
      `gateway request failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new CarvisScheduleGatewayClientError(`gateway request failed: ${response.status}`, {
      status: response.status,
    });
  }

  let payload: { ok: boolean; result: ScheduleToolResult };
  try {
    payload = await response.json() as { ok: boolean; result: ScheduleToolResult };
  } catch (error) {
    throw new CarvisScheduleGatewayClientError("gateway request failed: invalid json", {
      cause: error,
    });
  }

  return payload.result;
}

async function executeOverQueue(
  queueRoot: string,
  request: Parameters<CarvisScheduleGatewayClient["execute"]>[0],
  timeoutMs: number,
) {
  const requestsDir = join(queueRoot, "requests");
  const responsesDir = join(queueRoot, "responses");
  await mkdir(requestsDir, { recursive: true });
  await mkdir(responsesDir, { recursive: true });

  const requestId = randomUUID();
  const requestPath = join(requestsDir, `${requestId}.json`);
  const requestTempPath = join(requestsDir, `${requestId}.tmp`);
  const responsePath = join(responsesDir, `${requestId}.json`);

  await writeFile(requestTempPath, JSON.stringify(toGatewayPayload(request)));
  await rename(requestTempPath, requestPath);

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const payloadText = await readFile(responsePath, "utf8");
      await rm(responsePath, { force: true });
      return parseGatewayQueueResponse(payloadText);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new CarvisScheduleGatewayClientError(`gateway request failed: queue timeout after ${timeoutMs}ms`);
}

function parseGatewayQueueResponse(payloadText: string) {
  let parsed: { ok: boolean; error?: string; result?: ScheduleToolResult };
  try {
    parsed = JSON.parse(payloadText) as { ok: boolean; error?: string; result?: ScheduleToolResult };
  } catch (error) {
    throw new CarvisScheduleGatewayClientError("gateway request failed: invalid queue json", {
      cause: error,
    });
  }

  if (!parsed.ok || !parsed.result) {
    throw new CarvisScheduleGatewayClientError(
      `gateway request failed: ${parsed.error ?? "queue request failed"}`,
    );
  }

  return parsed.result;
}

function toGatewayPayload(request: Parameters<CarvisScheduleGatewayClient["execute"]>[0]) {
  return {
    requestId: randomUUID(),
    toolName: `schedule.${request.actionType}`,
    invocation: request.invocation,
    workspace: request.workspace,
    sessionId: request.sessionId,
    chatId: request.chatId,
    userId: request.userId,
    requestedText: request.requestedText,
  };
}
