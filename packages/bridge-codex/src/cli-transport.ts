import { mkdtemp, readFile, rm } from "node:fs/promises";
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
      const child = spawn(
        codexCommand,
        [
          "exec",
          "--json",
          "--color",
          "never",
          "--skip-git-repo-check",
          "-C",
          request.workspace,
          "--output-last-message",
          outputFile,
          request.prompt,
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      child.stdout.setEncoding("utf8");
      let stderr = "";
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
          yield {
            type: "error" as const,
            failureCode: "codex_exec_failed",
            failureMessage: stderr.trim() || `codex exited with code ${exitCode}`,
          };
          return;
        }

        const resultSummary = (await readFile(outputFile, "utf8")).trim();
        yield {
          type: "result" as const,
          resultSummary: resultSummary || "codex exec completed",
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
  remaining: string;
} {
  const lines = buffer.split("\n");
  const tailCandidate = lines.pop() ?? "";
  const remaining = input.flushTail ? "" : tailCandidate;
  const deltas = lines.flatMap((line) => {
    const text = line.trim();
    if (!text) {
      return [];
    }

    const parsed = parseCodexJsonLine(text);
    if (!parsed) {
      return [];
    }

    return parsed.map((delta) => ({
      type: "delta" as const,
      deltaText: delta.text,
      sequence: input.nextSequence(),
      source: delta.source,
    }));
  });

  if (!input.flushTail) {
    return {
      deltas,
      remaining,
    };
  }

  const tail = tailCandidate.trim();
  if (!tail) {
    return { deltas, remaining: "" };
  }

  const parsedTail = parseCodexJsonLine(tail);
  return {
    deltas: [
      ...deltas,
      ...(parsedTail?.map((delta) => ({
        type: "delta" as const,
        deltaText: delta.text,
        sequence: input.nextSequence(),
        source: delta.source,
      })) ?? []),
    ],
    remaining: "",
  };
}

function parseCodexJsonLine(line: string): Array<{ text: string; source?: string }> | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const source = readEventSource(parsed);
    const texts = collectTextFragments(parsed).filter((text) => text.trim().length > 0);
    if (texts.length === 0) {
      return null;
    }

    return texts.map((text) => ({
      text,
      source,
    }));
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

const TEXT_KEYS = new Set(["content", "delta", "output_text", "text", "value"]);
const NESTED_KEYS = new Set(["content", "delta", "item", "message", "messages", "output", "parts"]);
