import type { RunEvent, RunRequest } from "@carvis/core";

export type ToolResultPayload = {
  toolName: string;
  result: Record<string, unknown>;
};

export type TransportChunk =
  | { type: "delta"; deltaText: string; sequence: number; source?: string }
  | { type: "summary"; summary: string; sequence: number }
  | {
      type: "result";
      resultSummary: string;
      bridgeSessionId?: string;
      sessionOutcome?: "created" | "continued" | "unchanged";
    }
  | { type: "tool_call"; toolName: string; arguments: Record<string, unknown>; handledByTransport?: boolean }
  | { type: "tool_result"; toolName: string; result: Record<string, unknown>; handledByTransport?: boolean }
  | { type: "error"; failureCode: string; failureMessage: string; sessionInvalid?: boolean }
  | { type: "cancelled"; reason?: string }
  | { type: "wait-for-cancel" };

export type TransportRun = {
  stream(): AsyncIterable<TransportChunk>;
  submitToolResult?(input: ToolResultPayload): Promise<void>;
  [Symbol.asyncIterator](): AsyncIterator<TransportChunk>;
};

type TransportRunLike = TransportRun | AsyncIterable<TransportChunk>;

export interface CodexTransport {
  run(request: RunRequest, options: { signal: AbortSignal }): TransportRunLike;
}

interface BridgeHandle {
  runId: string;
  streamEvents(): AsyncIterable<RunEvent>;
  submitToolResult(input: ToolResultPayload): Promise<void>;
}

export class CodexBridge {
  private readonly transport: CodexTransport;
  private readonly healthcheckFn?: () => Promise<{ ok: true; message: string }>;
  private readonly now: () => Date;
  private readonly controllers = new Map<string, AbortController>();

  constructor(options: {
    healthcheck?: () => Promise<{ ok: true; message: string }>;
    now?: () => Date;
    transport: CodexTransport;
  }) {
    this.healthcheckFn = options.healthcheck;
    this.transport = options.transport;
    this.now = options.now ?? (() => new Date());
  }

  async startRun(request: RunRequest): Promise<BridgeHandle> {
    const now = this.now;
    const controllers = this.controllers;
    const controller = new AbortController();
    this.controllers.set(request.id, controller);
    const rawTransportRun = this.transport.run(request, {
      signal: controller.signal,
    });
    const transportRun = normalizeTransportRun(rawTransportRun);

    return {
      runId: request.id,
      streamEvents: async function* () {
        try {
          for await (const chunk of transportRun.stream()) {
            if (chunk.type === "delta") {
              yield {
                id: `${request.id}:delta:${chunk.sequence}`,
                runId: request.id,
                eventType: "agent.output.delta",
                payload: {
                  run_id: request.id,
                  delta_text: chunk.deltaText,
                  sequence: chunk.sequence,
                  source: chunk.source ?? "assistant",
                },
                createdAt: now().toISOString(),
              } satisfies RunEvent;
              continue;
            }

            if (chunk.type === "summary") {
              yield {
                id: `${request.id}:summary:${chunk.sequence}`,
                runId: request.id,
                eventType: "agent.summary",
                payload: {
                  run_id: request.id,
                  summary: chunk.summary,
                  sequence: chunk.sequence,
                },
                createdAt: now().toISOString(),
              } satisfies RunEvent;
              continue;
            }

            if (chunk.type === "tool_call") {
              yield {
                id: `${request.id}:tool_call`,
                runId: request.id,
                eventType: "agent.tool_call",
                payload: {
                  run_id: request.id,
                  tool_name: chunk.toolName,
                  arguments: chunk.arguments,
                  ...(chunk.handledByTransport ? { handled_by_transport: true } : {}),
                },
                createdAt: now().toISOString(),
              } satisfies RunEvent;
              continue;
            }

            if (chunk.type === "tool_result") {
              yield {
                id: `${request.id}:tool_result`,
                runId: request.id,
                eventType: "agent.tool_result",
                payload: {
                  run_id: request.id,
                  tool_name: chunk.toolName,
                  result: chunk.result,
                  ...(chunk.handledByTransport ? { handled_by_transport: true } : {}),
                },
                createdAt: now().toISOString(),
              } satisfies RunEvent;
              continue;
            }

            if (chunk.type === "result") {
              yield {
                id: `${request.id}:completed`,
                runId: request.id,
                eventType: "run.completed",
                payload: {
                  run_id: request.id,
                  finished_at: now().toISOString(),
                  result_summary: chunk.resultSummary,
                  ...(chunk.bridgeSessionId ? { bridge_session_id: chunk.bridgeSessionId } : {}),
                  ...(chunk.sessionOutcome ? { session_outcome: chunk.sessionOutcome } : {}),
                },
                createdAt: now().toISOString(),
              } satisfies RunEvent;
              continue;
            }

            if (chunk.type === "error") {
              yield {
                id: `${request.id}:failed`,
                runId: request.id,
                eventType: "run.failed",
                payload: {
                  run_id: request.id,
                  failure_code: chunk.failureCode,
                  failure_message: chunk.failureMessage,
                  ...(chunk.sessionInvalid !== undefined ? { session_invalid: chunk.sessionInvalid } : {}),
                },
                createdAt: now().toISOString(),
              } satisfies RunEvent;
              continue;
            }

            if (chunk.type === "cancelled") {
              yield {
                id: `${request.id}:cancelled`,
                runId: request.id,
                eventType: "run.cancelled",
                payload: {
                  run_id: request.id,
                  cancelled_at: now().toISOString(),
                  reason: chunk.reason ?? "cancel requested",
                },
                createdAt: now().toISOString(),
              } satisfies RunEvent;
            }
          }
        } finally {
          controllers.delete(request.id);
        }
      },
      async submitToolResult(input) {
        await transportRun.submitToolResult?.(input);
      },
    };
  }

  async cancelRun(runId: string): Promise<void> {
    const controller = this.controllers.get(runId);
    controller?.abort();
  }

  async healthcheck(): Promise<{ ok: true; message: string }> {
    return this.healthcheckFn?.() ?? {
      ok: true,
      message: "codex bridge ready",
    };
  }
}

function normalizeTransportRun(input: TransportRunLike): TransportRun {
  if ("stream" in input && typeof input.stream === "function") {
    return input;
  }
  return {
    stream() {
      return input;
    },
    [Symbol.asyncIterator]() {
      return input[Symbol.asyncIterator]();
    },
  };
}

export function createScriptedCodexTransport(script: TransportChunk[]): CodexTransport {
  return {
    run(_request, options) {
      let pendingToolResult: ToolResultPayload | null = null;
      let resolveToolResult: (() => void) | null = null;
      const transportRun: TransportRun = {
        async *stream() {
          for (const step of script) {
            if (step.type === "wait-for-cancel") {
              await waitForAbort(options.signal);
              yield {
                type: "cancelled",
                reason: "cancel requested",
              } satisfies TransportChunk;
              return;
            }

            if (options.signal.aborted) {
              yield {
                type: "cancelled",
                reason: "cancel requested",
              } satisfies TransportChunk;
              return;
            }

            if (step.type === "tool_call") {
              yield step;
              if (step.handledByTransport) {
                continue;
              }
              if (!pendingToolResult) {
                await new Promise<void>((resolve) => {
                  resolveToolResult = resolve;
                });
              }
              if (options.signal.aborted) {
                yield {
                  type: "cancelled",
                  reason: "cancel requested",
                } satisfies TransportChunk;
                return;
              }
              yield {
                type: "result",
                resultSummary: readToolResultSummary(pendingToolResult),
              } satisfies TransportChunk;
              return;
            }

            yield step;
          }
        },
        async submitToolResult(input) {
          pendingToolResult = input;
          resolveToolResult?.();
        },
        [Symbol.asyncIterator]() {
          return transportRun.stream()[Symbol.asyncIterator]();
        },
      };
      return transportRun;
    },
  };
}

function readToolResultSummary(input: ToolResultPayload | null) {
  if (!input) {
    return "tool executed";
  }
  const summary = input.result.summary;
  return typeof summary === "string" && summary.length > 0 ? summary : "tool executed";
}

async function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    signal.addEventListener(
      "abort",
      () => {
        resolve();
      },
      { once: true },
    );
  });
}
