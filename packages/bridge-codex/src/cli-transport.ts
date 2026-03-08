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

      child.stdout.resume();
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });

      const abortHandler = () => {
        child.kill("SIGTERM");
      };
      input.signal.addEventListener("abort", abortHandler, { once: true });

      try {
        const exitCode = await new Promise<number>((resolve, reject) => {
          child.once("error", reject);
          child.once("close", (code) => resolve(code ?? 1));
        });

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
