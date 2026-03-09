import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import type { CodexTransport } from "./bridge.ts";

const execFileAsync = promisify(execFile);

type CreateCodexCliTransportOptions = {
  codexCommand?: string;
};

export function createCodexCliTransport(
  options: CreateCodexCliTransportOptions = {},
): CodexTransport {
  const codexCommand = options.codexCommand ?? "codex";

  return {
    async *run(request, input) {
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
          for (const delta of consumed.deltas) {
            yield delta;
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
        for (const delta of flushed.deltas) {
          yield delta;
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
        const sessionOutcome =
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
  };
}

export async function codexCliHealthcheck(
  codexCommand = "codex",
): Promise<{ ok: true; message: string }> {
  await execFileAsync(codexCommand, ["--version"]);
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
  deltas: Array<{ type: "delta"; deltaText: string; sequence: number; source?: string }>;
  bridgeSessionId?: string;
  remaining: string;
} {
  const lines = buffer.split("\n");
  const tailCandidate = lines.pop() ?? "";
  const remaining = input.flushTail ? "" : tailCandidate;
  let bridgeSessionId: string | undefined;
  const deltas = lines.flatMap((line) => {
    const text = line.trim();
    if (!text) {
      return [];
    }

    const parsed = parseCodexJsonLine(text);
    if (!parsed) {
      return [];
    }

    bridgeSessionId = parsed.bridgeSessionId ?? bridgeSessionId;

    return parsed.deltas.map((delta) => ({
      type: "delta" as const,
      deltaText: delta.text,
      sequence: input.nextSequence(),
      source: delta.source,
    }));
  });

  if (!input.flushTail) {
    return {
      deltas,
      bridgeSessionId,
      remaining,
    };
  }

  const tail = tailCandidate.trim();
  if (!tail) {
    return { deltas, bridgeSessionId, remaining: "" };
  }

  const parsedTail = parseCodexJsonLine(tail);
  return {
    deltas: [
      ...deltas,
      ...(parsedTail?.deltas.map((delta) => ({
        type: "delta" as const,
        deltaText: delta.text,
        sequence: input.nextSequence(),
        source: delta.source,
      })) ?? []),
    ],
    bridgeSessionId: parsedTail?.bridgeSessionId ?? bridgeSessionId,
    remaining: "",
  };
}

function parseCodexJsonLine(line: string): { deltas: Array<{ text: string; source?: string }>; bridgeSessionId?: string } | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const source = readEventSource(parsed);
    const texts = collectTextFragments(parsed).filter((text) => text.trim().length > 0);
    const bridgeSessionId = readBridgeSessionId(parsed);
    if (texts.length === 0 && !bridgeSessionId) {
      return null;
    }

    return {
      deltas: texts.map((text) => ({
        text,
        source,
      })),
      bridgeSessionId,
    };
  } catch {
    return null;
  }
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

const TEXT_KEYS = new Set(["content", "delta", "output_text", "text", "value"]);
const NESTED_KEYS = new Set(["content", "delta", "item", "message", "messages", "output", "parts"]);

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
