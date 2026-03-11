import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function resolveScheduleManagementSocketPath(
  env: Record<string, string | undefined> = process.env,
): string {
  const explicit = env.CARVIS_SCHEDULE_SOCKET_PATH;
  if (explicit && explicit.length > 0) {
    return explicit;
  }

  const workspacePath = env.CARVIS_WORKSPACE;
  if (workspacePath && workspacePath.length > 0) {
    return join(resolve(workspacePath), "carvis-schedule-ipc");
  }

  const homeDir = env.HOME && env.HOME.length > 0 ? env.HOME : homedir();
  return resolve(homeDir, "carvis-schedule-ipc");
}
