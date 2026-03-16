import { describe, expect, test } from "bun:test";

import { installExecutorSignalHandlers } from "../../apps/executor/src/index.ts";
import { installGatewaySignalHandlers } from "../../apps/gateway/src/index.ts";

describe("runtime signal handlers", () => {
  test("gateway signal handler 会调用 stop 并退出", async () => {
    const events = new Map<string, (signal: string) => void>();
    const calls: string[] = [];

    installGatewaySignalHandlers({
      exit(code) {
        calls.push(`exit:${code}`);
      },
      on(event, handler) {
        events.set(event, handler);
      },
      stop: async () => {
        calls.push("stop");
      },
    });

    await events.get("SIGTERM")?.("SIGTERM");

    expect(calls).toEqual(["stop", "exit:0"]);
  });

  test("executor signal handler stop 失败时以非零码退出", async () => {
    const events = new Map<string, (signal: string) => void>();
    const calls: string[] = [];

    installExecutorSignalHandlers({
      exit(code) {
        calls.push(`exit:${code}`);
      },
      on(event, handler) {
        events.set(event, handler);
      },
      stop: async () => {
        calls.push("stop");
        throw new Error("shutdown failed");
      },
      stderr(text) {
        calls.push(text);
      },
    });

    await events.get("SIGINT")?.("SIGINT");

    expect(calls).toEqual([
      "stop",
      "failed to stop executor on SIGINT: shutdown failed\n",
      "exit:1",
    ]);
  });
});
