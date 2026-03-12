import path from "node:path";

export type WorkspaceMemoryFlushPlan = {
  targetPath: string;
  userVisibleOutputCount: number;
};

export function shouldTriggerWorkspaceMemoryFlush(input: {
  nearCompaction: boolean;
  alreadyFlushed: boolean;
  cancelled: boolean;
  timedOut: boolean;
}): boolean {
  if (!input.nearCompaction) {
    return false;
  }
  if (input.alreadyFlushed || input.cancelled || input.timedOut) {
    return false;
  }
  return true;
}

export function resolveWorkspaceMemoryFlushPlan(input: {
  workspacePath: string;
  now?: Date;
}): WorkspaceMemoryFlushPlan {
  const now = input.now ?? new Date();
  const dateStamp = now.toISOString().slice(0, 10);

  return {
    targetPath: path.join(path.resolve(input.workspacePath), ".carvis", "memory", `${dateStamp}.md`),
    userVisibleOutputCount: 0,
  };
}
