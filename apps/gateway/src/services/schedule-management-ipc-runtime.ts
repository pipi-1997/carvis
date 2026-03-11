import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export async function ensureScheduleManagementIpcIgnored(workspacePath: string) {
  const excludePath = await resolveGitExcludePath(workspacePath);
  if (!excludePath) {
    return;
  }

  await mkdir(dirname(excludePath), { recursive: true });
  const existing = await readFile(excludePath, "utf8").catch(() => "");
  const rule = "carvis-schedule-ipc/";
  const lines = existing.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.includes(rule)) {
    return;
  }
  const next = existing.length === 0 ? `${rule}\n` : `${existing.replace(/\n?$/, "\n")}${rule}\n`;
  await writeFile(excludePath, next);
}

async function resolveGitExcludePath(workspacePath: string): Promise<string | null> {
  const dotGitPath = join(workspacePath, ".git");
  const gitStat = await stat(dotGitPath).catch(() => null);
  if (!gitStat) {
    return null;
  }

  if (gitStat.isDirectory()) {
    return join(dotGitPath, "info", "exclude");
  }

  const gitFile = await readFile(dotGitPath, "utf8").catch(() => null);
  if (!gitFile) {
    return null;
  }
  const match = /^gitdir:\s*(.+)\s*$/m.exec(gitFile);
  if (!match) {
    return null;
  }
  const gitDir = resolve(workspacePath, match[1]);
  return join(gitDir, "info", "exclude");
}
