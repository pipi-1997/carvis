import { describe, expect, test } from "bun:test";

import { startExecutor } from "../apps/executor/src/index.ts";
import { startGateway } from "../apps/gateway/src/index.ts";

describe("workspace scaffold", () => {
  test("gateway entrypoint exports startup function", () => {
    expect(typeof startGateway).toBe("function");
  });

  test("executor entrypoint exports startup function", () => {
    expect(typeof startExecutor).toBe("function");
  });
});
