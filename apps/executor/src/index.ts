import { createExecutorWorker } from "./worker.ts";

export function startExecutor(): string {
  return "executor:not-implemented";
}

export { createExecutorWorker };

if (import.meta.main) {
  console.log(startExecutor());
}
