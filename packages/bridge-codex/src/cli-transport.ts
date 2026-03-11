import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { resolveScheduleManagementSocketPath, type BridgeSessionOutcome, type RunRequest } from "@carvis/core";

import type { CodexTransport, ToolResultPayload, TransportRun } from "./bridge.ts";

const execFileAsync = promisify(execFile);

type CreateCodexCliTransportOptions = {
  codexCommand?: string;
  gatewayBaseUrl?: string;
};

export function createCodexCliTransport(
  options: CreateCodexCliTransportOptions = {},
): CodexTransport {
  const codexCommand = options.codexCommand ?? "codex";

  return {
    run(request, input) {
      const transportRun: TransportRun = {
        async *stream() {
          const tempDir = await mkdtemp(join(tmpdir(), "carvis-codex-"));
          const outputFile = join(tempDir, "last-message.txt");
          const spawnCwd = await resolveSpawnCwd(request.workspace);
          if (!spawnCwd) {
            yield {
              type: "error" as const,
              failureCode: "codex_exec_failed",
              failureMessage: `workspace is not a directory: ${request.workspace}`,
              sessionInvalid: false,
            };
            return;
          }
          const commandArgs =
            request.sessionMode === "continuation" && request.bridgeSessionId
              ? [
                  "exec",
                  "--sandbox",
                  "workspace-write",
                  "resume",
                  "--json",
                  "--skip-git-repo-check",
                  "--output-last-message",
                  outputFile,
                  request.bridgeSessionId,
                  request.prompt,
                ]
              : [
                  "exec",
                  "--sandbox",
                  "workspace-write",
                  "--json",
                  "--color",
                  "never",
                  "--skip-git-repo-check",
                  "--output-last-message",
                  outputFile,
                  request.prompt,
                ];
          const child = spawn(
            codexCommand,
            commandArgs,
            {
              cwd: spawnCwd,
              env: buildCodexRuntimeEnv({
                gatewayBaseUrl: options.gatewayBaseUrl,
                request,
              }),
              stdio: ["ignore", "pipe", "pipe"],
            },
          );

          child.stdout.setEncoding("utf8");
          let stderr = "";
          let bridgeSessionId: string | undefined;
          let sequence = 0;
          let stdoutBuffer = "";
          child.stderr.setEncoding("utf8");
          child.stderr.on("data", (chunk) => {
            stderr += chunk;
          });

          const abortHandler = () => {
            child.kill("SIGTERM");
          };
          input.signal.addEventListener("abort", abortHandler, { once: true });

          try {
            const exitCodePromise = new Promise<number>((resolve, reject) => {
              child.once("error", reject);
              child.once("close", (code) => resolve(code ?? 1));
            });

            for await (const chunk of child.stdout) {
              stdoutBuffer += chunk;
              const consumed = consumeJsonLines(stdoutBuffer, {
                flushTail: false,
                nextSequence() {
                  sequence += 1;
                  return sequence;
                },
              });
              stdoutBuffer = consumed.remaining;
              bridgeSessionId = consumed.bridgeSessionId ?? bridgeSessionId;
              for (const chunkItem of consumed.chunks) {
                yield chunkItem;
              }
            }

            const flushed = consumeJsonLines(stdoutBuffer, {
              flushTail: true,
              nextSequence() {
                sequence += 1;
                return sequence;
              },
            });
            bridgeSessionId = flushed.bridgeSessionId ?? bridgeSessionId;
            for (const chunkItem of flushed.chunks) {
              yield chunkItem;
            }

            const exitCode = await exitCodePromise;

            if (input.signal.aborted) {
              yield {
                type: "cancelled" as const,
                reason: "cancel requested",
              };
              return;
            }

            if (exitCode !== 0) {
              const failureMessage = stderr.trim() || `codex exited with code ${exitCode}`;
              yield {
                type: "error" as const,
                failureCode: "codex_exec_failed",
                failureMessage,
                sessionInvalid: request.sessionMode === "continuation" && looksLikeInvalidSessionError(failureMessage),
              };
              return;
            }

            const resultSummary = (await readFile(outputFile, "utf8")).trim();
            const sessionOutcome: BridgeSessionOutcome =
              request.sessionMode === "continuation" && request.bridgeSessionId
                ? bridgeSessionId && bridgeSessionId !== request.bridgeSessionId
                  ? "created"
                  : "continued"
                : bridgeSessionId
                  ? "created"
                  : "unchanged";
            yield {
              type: "result" as const,
              resultSummary: resultSummary || "codex exec completed",
              bridgeSessionId,
              sessionOutcome,
            };
          } finally {
            input.signal.removeEventListener("abort", abortHandler);
            await rm(tempDir, { force: true, recursive: true });
          }
        },
        async submitToolResult(_inputPayload: ToolResultPayload) {
          return;
        },
        [Symbol.asyncIterator]() {
          return transportRun.stream()[Symbol.asyncIterator]();
        },
      };
      return transportRun;
    },
  };
}

function buildCodexRuntimeEnv(input: {
  gatewayBaseUrl?: string;
  request: RunRequest;
}) {
  const requestedText = extractRequestedText(input.request.prompt);
  return {
    ...buildCarvisSchedulePathEnv(process.env),
    ...(input.gatewayBaseUrl
      ? {
          CARVIS_GATEWAY_BASE_URL: input.gatewayBaseUrl,
          CARVIS_SCHEDULE_SOCKET_PATH: resolveScheduleManagementSocketPath({
            ...process.env,
            CARVIS_WORKSPACE: input.request.workspace,
          }),
          CARVIS_WORKSPACE: input.request.workspace,
          CARVIS_SESSION_ID: input.request.sessionId ?? "",
          CARVIS_CHAT_ID: input.request.chatId ?? "",
          CARVIS_USER_ID: input.request.triggerUserId ?? "",
          CARVIS_REQUESTED_TEXT: requestedText,
        }
      : {}),
  };
}

function extractRequestedText(prompt: string) {
  const marker = "Original user request JSON: ";
  const markerIndex = prompt.indexOf(marker);
  if (markerIndex < 0) {
    return prompt;
  }
  const encoded = prompt.slice(markerIndex + marker.length).trim();
  try {
    const parsed = JSON.parse(encoded) as unknown;
    return typeof parsed === "string" ? parsed : prompt;
  } catch {
    return prompt;
  }
}

function readExecFailureMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function codexCliHealthcheck(
  input: string | {
    codexCommand?: string;
    scheduleCommand?: string;
    timeoutMs?: number;
    workspace?: string;
  } = "codex",
): Promise<{ ok: true; message: string }> {
  const options = typeof input === "string" ? { codexCommand: input } : input;
  const codexCommand = options.codexCommand ?? "codex";
  const scheduleCommand = options.scheduleCommand ?? "carvis-schedule";
  const timeoutMs = options.timeoutMs ?? 15_000;
  const env = buildCarvisSchedulePathEnv(process.env);

  try {
    await execFileAsync(codexCommand, ["--version"], {
      env,
      timeout: timeoutMs,
    });
  } catch (error) {
    throw new Error(`codex unavailable: ${readExecFailureMessage(error)}`);
  }

  const spawnCwd = await resolveSpawnCwd(options.workspace ?? tmpdir());
  if (!spawnCwd) {
    throw new Error(`workspace is not a directory: ${options.workspace}`);
  }

  try {
    await execFileAsync(scheduleCommand, ["--help"], {
      cwd: spawnCwd,
      env,
      timeout: timeoutMs,
    });
  } catch (error) {
    throw new Error(`carvis-schedule unavailable: ${readExecFailureMessage(error)}`);
  }

  return {
    ok: true,
    message: "codex cli ready",
  };
}

function consumeJsonLines(
  buffer: string,
  input: {
    flushTail: boolean;
    nextSequence(): number;
  },
): {
  chunks: Array<
    | { type: "delta"; deltaText: string; sequence: number; source?: string }
    | { type: "tool_call"; toolName: string; arguments: Record<string, unknown>; handledByTransport: true }
    | { type: "tool_result"; toolName: string; result: Record<string, unknown>; handledByTransport: true }
  >;
  bridgeSessionId?: string;
  remaining: string;
} {
  const lines = buffer.split("\n");
  const tailCandidate = lines.pop() ?? "";
  const remaining = input.flushTail ? "" : tailCandidate;
  let bridgeSessionId: string | undefined;
  const chunks = lines.flatMap((line) => {
    const text = line.trim();
    if (!text) {
      return [];
    }

    const parsed = parseCodexJsonLine(text);
    if (!parsed) {
      return [];
    }

    bridgeSessionId = parsed.bridgeSessionId ?? bridgeSessionId;
    return parsed.chunks.map((chunk) => withSequence(chunk, input.nextSequence));
  });

  if (!input.flushTail) {
    return {
      chunks,
      bridgeSessionId,
      remaining,
    };
  }

  const tail = tailCandidate.trim();
  if (!tail) {
    return { chunks, bridgeSessionId, remaining: "" };
  }

  const parsedTail = parseCodexJsonLine(tail);
  return {
    chunks: [
      ...chunks,
      ...(parsedTail?.chunks.map((chunk) => withSequence(chunk, input.nextSequence)) ?? []),
    ],
    bridgeSessionId: parsedTail?.bridgeSessionId ?? bridgeSessionId,
    remaining: "",
  };
}

function withSequence(
  chunk: ParsedCodexChunk,
  nextSequence: () => number,
):
  | { type: "delta"; deltaText: string; sequence: number; source?: string }
  | { type: "tool_call"; toolName: string; arguments: Record<string, unknown>; handledByTransport: true }
  | { type: "tool_result"; toolName: string; result: Record<string, unknown>; handledByTransport: true } {
  if (chunk.type === "delta") {
    return {
      type: "delta",
      deltaText: chunk.deltaText,
      sequence: nextSequence(),
      source: chunk.source,
    };
  }
  return chunk;
}

type ParsedCodexChunk =
  | { type: "delta"; deltaText: string; source?: string }
  | { type: "tool_call"; toolName: string; arguments: Record<string, unknown>; handledByTransport: true }
  | { type: "tool_result"; toolName: string; result: Record<string, unknown>; handledByTransport: true };

function parseCodexJsonLine(line: string): { chunks: ParsedCodexChunk[]; bridgeSessionId?: string } | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const eventType = readEventType(parsed);
    if (eventType === "mcp_tool_call_begin") {
      const toolName = readToolName(parsed);
      const argumentsValue = readToolArguments(parsed);
      if (!toolName || !argumentsValue) {
        return null;
      }
      return {
        chunks: [{
          type: "tool_call",
          toolName,
          arguments: argumentsValue,
          handledByTransport: true,
        }],
        bridgeSessionId: readBridgeSessionId(parsed),
      };
    }

    if (eventType === "mcp_tool_call_end") {
      const toolName = readToolName(parsed);
      const result = readToolResult(parsed);
      if (!toolName || !result) {
        return null;
      }
      return {
        chunks: [{
          type: "tool_result",
          toolName,
          result,
          handledByTransport: true,
        }],
        bridgeSessionId: readBridgeSessionId(parsed),
      };
    }

    const source = readEventSource(parsed);
    const texts = collectTextFragments(parsed).filter((text) => text.trim().length > 0);
    const bridgeSessionId = readBridgeSessionId(parsed);
    if (texts.length === 0 && !bridgeSessionId) {
      return null;
    }

    return {
      chunks: texts.map((text) => ({
        type: "delta",
        deltaText: text,
        source,
      })),
      bridgeSessionId,
    };
  } catch {
    return null;
  }
}

function readEventType(value: object): string | undefined {
  const eventType = Reflect.get(value, "type");
  return typeof eventType === "string" && eventType.length > 0 ? eventType : undefined;
}

function collectTextFragments(value: unknown, key?: string): string[] {
  if (typeof value === "string") {
    if (key && TEXT_KEYS.has(key)) {
      return [value];
    }
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextFragments(item));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const fragments: string[] = [];
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue === "string") {
      if (TEXT_KEYS.has(entryKey)) {
        fragments.push(entryValue);
      }
      continue;
    }

    if (NESTED_KEYS.has(entryKey) || Array.isArray(entryValue) || (entryValue && typeof entryValue === "object")) {
      fragments.push(...collectTextFragments(entryValue, entryKey));
    }
  }
  return fragments;
}

function readEventSource(value: object): string | undefined {
  const source = Reflect.get(value, "source");
  if (typeof source === "string" && source.length > 0) {
    return source;
  }

  const role = Reflect.get(value, "role");
  if (typeof role === "string" && role.length > 0) {
    return role;
  }

  return undefined;
}

function readBridgeSessionId(value: object): string | undefined {
  const threadId = Reflect.get(value, "thread_id");
  if (typeof threadId === "string" && threadId.length > 0) {
    return threadId;
  }

  const sessionId = Reflect.get(value, "session_id");
  if (typeof sessionId === "string" && sessionId.length > 0) {
    return sessionId;
  }

  return undefined;
}

function readToolName(value: object): string | undefined {
  const directToolName = Reflect.get(value, "tool_name");
  if (typeof directToolName === "string" && directToolName.length > 0) {
    return directToolName;
  }

  const directName = Reflect.get(value, "name");
  if (typeof directName === "string" && directName.length > 0) {
    return directName;
  }

  const payload = readRecordLike(Reflect.get(value, "payload"));
  if (payload) {
    const payloadToolName = readToolName(payload);
    if (payloadToolName) {
      return payloadToolName;
    }
  }

  return undefined;
}

function readToolArguments(value: object): Record<string, unknown> | undefined {
  return (
    readRecordLike(Reflect.get(value, "arguments"))
    ?? readRecordLike(Reflect.get(value, "input"))
    ?? readRecordLike(Reflect.get(value, "params"))
    ?? readRecordLike(Reflect.get(value, "parsed_arguments"))
    ?? readRecordLike(readRecordLike(Reflect.get(value, "payload"))?.arguments)
    ?? undefined
  );
}

function readToolResult(value: object): Record<string, unknown> | undefined {
  return (
    readRecordLike(Reflect.get(value, "result"))
    ?? readRecordLike(Reflect.get(value, "structuredContent"))
    ?? readRecordLike(Reflect.get(value, "structured_content"))
    ?? readRecordLike(Reflect.get(value, "output"))
    ?? readRecordLike(readRecordLike(Reflect.get(value, "payload"))?.result)
    ?? undefined
  );
}

function readRecordLike(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

const TEXT_KEYS = new Set(["content", "delta", "output_text", "text", "value"]);
const NESTED_KEYS = new Set(["content", "delta", "item", "message", "messages", "output", "parts"]);

function buildCarvisSchedulePathEnv(baseEnv: NodeJS.ProcessEnv) {
  const carvisScheduleBinDir = fileURLToPath(new URL("../../carvis-schedule-cli/bin/", import.meta.url));
  return {
    ...baseEnv,
    PATH: [carvisScheduleBinDir, baseEnv.PATH ?? ""].filter((value) => value.length > 0).join(":"),
  };
}

async function resolveSpawnCwd(workspace: string): Promise<string | undefined> {
  try {
    const info = await stat(workspace);
    return info.isDirectory() ? workspace : undefined;
  } catch {
    return undefined;
  }
}

function looksLikeInvalidSessionError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("session not found") ||
    normalized.includes("invalid session") ||
    normalized.includes("unable to resume") ||
    normalized.includes("could not resume")
  );
}
