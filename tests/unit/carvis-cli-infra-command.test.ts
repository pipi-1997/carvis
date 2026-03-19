import { describe, expect, test } from "bun:test";

import { createInfraCommandService } from "../../packages/carvis-cli/src/infra-command.ts";

describe("carvis infra command", () => {
  test("daemon 不可达时 start 不会伪造 infra ready", async () => {
    const service = createInfraCommandService({
      daemonClient: {
        async readCachedStatus() {
          return null;
        },
        async request() {
          throw new Error("daemon unreachable");
        },
        socketPath: "/tmp/daemon.sock",
      },
      env: {
        ...process.env,
        HOME: "/tmp/carvis-infra-command",
      },
    });

    const result = await service.run({
      operation: "start",
    });

    expect(result).toEqual(
      expect.objectContaining({
        command: "infra",
        operation: "start",
        status: "failed",
      }),
    );
  });
});
