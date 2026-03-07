import { describe, expect, test } from "bun:test";

import { startExecutor } from "../apps/executor/src/index.ts";
import { startGateway } from "../apps/gateway/src/index.ts";

describe("workspace scaffold", () => {
  test("gateway entrypoint is wired", () => {
    expect(startGateway()).toBe("gateway:not-implemented");
  });

  test("executor entrypoint is wired", () => {
    expect(startExecutor()).toBe("executor:not-implemented");
  });
});
