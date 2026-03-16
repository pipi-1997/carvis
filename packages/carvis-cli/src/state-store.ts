import { clearLocalRuntimeProcessState, readLocalRuntimeProcessState } from "@carvis/core";
import { writeLocalRuntimeProcessState } from "@carvis/core";
import type { LocalRuntimeProcessState, LocalRuntimeRole } from "@carvis/core";

import { resolveCarvisRuntimeFileSet, type CarvisRuntimeFileSet } from "./config-writer.ts";

type CreateCarvisStateStoreOptions = {
  fileSet?: CarvisRuntimeFileSet;
  processExists?: (pid: number) => boolean;
};

export { resolveCarvisRuntimeFileSet };
export type { CarvisRuntimeFileSet, LocalRuntimeProcessState, LocalRuntimeRole };

export function createCarvisStateStore(options: CreateCarvisStateStoreOptions = {}) {
  const fileSet = options.fileSet ?? resolveCarvisRuntimeFileSet();
  const processExists = options.processExists ?? defaultProcessExists;

  return {
    async clear(role: LocalRuntimeRole) {
      await clearLocalRuntimeProcessState(fileSet.stateDir, role);
    },
    async cleanupStale(): Promise<LocalRuntimeRole[]> {
      const removed: LocalRuntimeRole[] = [];
      for (const role of ["gateway", "executor"] as const) {
        const state = await readLocalRuntimeProcessState(fileSet.stateDir, role);
        if (!state) {
          continue;
        }
        if (processExists(state.pid)) {
          continue;
        }
        await clearLocalRuntimeProcessState(fileSet.stateDir, role);
        removed.push(role);
      }
      return removed;
    },
    fileSet,
    async read(role: LocalRuntimeRole) {
      return readLocalRuntimeProcessState(fileSet.stateDir, role);
    },
    async readAll() {
      const [gateway, executor] = await Promise.all([
        readLocalRuntimeProcessState(fileSet.stateDir, "gateway"),
        readLocalRuntimeProcessState(fileSet.stateDir, "executor"),
      ]);
      return {
        executor,
        gateway,
      };
    },
    async write(state: LocalRuntimeProcessState) {
      await writeLocalRuntimeProcessState(fileSet.stateDir, state);
    },
  };
}

function defaultProcessExists(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
