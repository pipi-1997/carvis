import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Hono } from "hono";

export async function startScheduleManagementIpcServer(input: {
  app: Hono;
  socketPath: string;
}) {
  const queueRoot = input.socketPath;
  const requestsDir = join(queueRoot, "requests");
  const responsesDir = join(queueRoot, "responses");
  await mkdir(requestsDir, { recursive: true });
  await mkdir(responsesDir, { recursive: true });

  let stopped = false;
  let running = false;
  const timer = setInterval(() => {
    void processRequests();
  }, 100);

  async function processRequests() {
    if (stopped || running) {
      return;
    }
    running = true;

    try {
      const files = await readdir(requestsDir);
      for (const file of files) {
        if (!file.endsWith('.json')) {
          continue;
        }
        const requestPath = join(requestsDir, file);
        const processingPath = join(requestsDir, `${file}.processing`);
        try {
          await rename(requestPath, processingPath);
        } catch {
          continue;
        }

        const payloadText = await readFile(processingPath, 'utf8');
        const responseText = await executeRequest(input.app, payloadText);
        await writeFile(join(responsesDir, file), responseText);
        await rm(processingPath, { force: true });
      }
    } finally {
      running = false;
    }
  }

  return {
    socketPath: queueRoot,
    async stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}

async function executeRequest(app: Hono, payloadText: string) {
  try {
    const payload = JSON.parse(payloadText) as unknown;
    const response = await app.request("http://localhost/internal/run-tools/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return await response.text();
  } catch (error) {
    return JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
