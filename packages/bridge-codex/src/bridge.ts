import type { RunEvent, RunRequest } from "@carvis/core";

type TransportChunk =
  | { type: "delta"; deltaText: string; sequence: number; source?: string }
  | { type: "summary"; summary: string; sequence: number }
  | {
      type: "result";
      resultSummary: string;
      bridgeSessionId?: string;
      sessionOutcome?: "created" | "continued" | "unchanged";
    }
  | { type: "error"; failureCode: string; failureMessage: string; sessionInvalid?: boolean }
  | { type: "cancelled"; reason?: string }
  | { type: "wait-for-cancel" };

export interface CodexTransport {
  run(request: RunRequest, options: { signal: AbortSignal }): AsyncIterable<TransportChunk>;
}

interface BridgeHandle {
  runId: string;
  streamEvents(): AsyncIterable<RunEvent>;
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
    const stream = this.transport.run(request, {
      signal: controller.signal,
    });

    return {
      runId: request.id,
      streamEvents: async function* () {
        try {
          for await (const chunk of stream) {
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

export function createScriptedCodexTransport(script: TransportChunk[]): CodexTransport {
  return {
    async *run(_request, options) {
      for (const step of script) {
        if (step.type === "wait-for-cancel") {
          await waitForAbort(options.signal);
          yield {
            type: "cancelled",
            reason: "cancel requested",
          };
          return;
        }

        if (options.signal.aborted) {
          yield {
            type: "cancelled",
            reason: "cancel requested",
          };
          return;
        }

        yield step;
      }
    },
  };
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
