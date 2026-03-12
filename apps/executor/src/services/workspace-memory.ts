import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type WorkspaceMemoryKind = "long_term" | "daily";

export type WorkspaceMemoryPaths = {
  workspacePath: string;
  carvisDirPath: string;
  memoryPath: string;
  dailyMemoryDirPath: string;
  todayDailyMemoryPath: string;
  yesterdayDailyMemoryPath: string;
};

export type WorkspaceMemoryInput = {
  kind: WorkspaceMemoryKind;
  path: string;
  content: string;
};

export type WorkspaceMemoryExcerpt = {
  excerptText: string;
  sources: string[];
  selectedSections: string[];
  approxTokens: number;
};

export type LoadedWorkspaceMemoryContext = WorkspaceMemoryExcerpt & {
  filesScanned: number;
  memories: WorkspaceMemoryInput[];
};

export type WorkspaceMemoryState = {
  memoryPath: string;
  todayDailyMemoryPath: string;
  entries: Array<{
    path: string;
    changeType: "long_term" | "daily";
    contentHash: string | null;
    content: string;
    exists: boolean;
  }>;
};

export type WorkspaceMemoryWriteObservation = {
  targetPath: string;
  changeType: "long_term" | "daily";
  changed: boolean;
  createdFile: boolean;
  beforeHash: string | null;
  afterHash: string | null;
  summary: string;
};

const DEFAULT_EXCERPT_MAX_CHARS = 1200;

export function resolveWorkspaceMemoryPaths(input: {
  workspacePath: string;
  now?: Date;
}): WorkspaceMemoryPaths {
  const workspacePath = path.resolve(input.workspacePath);
  const now = input.now ?? new Date();
  const carvisDirPath = path.join(workspacePath, ".carvis");
  const dailyMemoryDirPath = path.join(carvisDirPath, "memory");

  return {
    workspacePath,
    carvisDirPath,
    memoryPath: path.join(carvisDirPath, "MEMORY.md"),
    dailyMemoryDirPath,
    todayDailyMemoryPath: path.join(dailyMemoryDirPath, `${formatDate(now)}.md`),
    yesterdayDailyMemoryPath: path.join(dailyMemoryDirPath, `${formatDate(daysAgo(now, 1))}.md`),
  };
}

export function buildWorkspaceMemoryExcerpt(input: {
  memories: WorkspaceMemoryInput[];
  maxChars?: number;
}): WorkspaceMemoryExcerpt {
  const maxChars = Math.max(1, input.maxChars ?? DEFAULT_EXCERPT_MAX_CHARS);
  const normalized = input.memories
    .map((memory) => ({
      ...memory,
      content: memory.content.trim(),
    }))
    .filter((memory) => memory.content.length > 0);

  const sources: string[] = [];
  const selectedSections = new Set<string>();
  const excerptParts: string[] = [];
  const perMemoryBudget = Math.max(32, Math.floor(maxChars / Math.max(1, normalized.length)));

  for (const memory of normalized) {
    sources.push(memory.path);
    selectedSections.add(memory.kind === "long_term" ? "MEMORY.md" : "daily");
    const nextChunk = `${memory.path}\n${memory.content}`;
    excerptParts.push(nextChunk.slice(0, perMemoryBudget));
  }

  const excerptText = excerptParts.join("\n\n").slice(0, maxChars);

  return {
    excerptText,
    sources,
    selectedSections: [...selectedSections],
    approxTokens: Math.ceil(excerptText.length / 4),
  };
}

export async function captureWorkspaceMemoryState(input: {
  workspacePath: string;
  now?: Date;
}): Promise<WorkspaceMemoryState> {
  const paths = resolveWorkspaceMemoryPaths(input);
  const entries = await Promise.all([
    captureMemoryEntry(paths.memoryPath, "long_term"),
    captureMemoryEntry(paths.todayDailyMemoryPath, "daily"),
  ]);

  return {
    memoryPath: paths.memoryPath,
    todayDailyMemoryPath: paths.todayDailyMemoryPath,
    entries,
  };
}

export async function loadWorkspaceMemoryContext(input: {
  workspacePath: string;
  now?: Date;
  maxChars?: number;
}): Promise<LoadedWorkspaceMemoryContext> {
  const paths = resolveWorkspaceMemoryPaths(input);
  const candidates = [
    { kind: "long_term" as const, path: paths.memoryPath },
    { kind: "daily" as const, path: paths.todayDailyMemoryPath },
    { kind: "daily" as const, path: paths.yesterdayDailyMemoryPath },
  ];

  const memories: WorkspaceMemoryInput[] = [];
  let filesScanned = 0;

  for (const candidate of candidates) {
    const content = await readOptionalUtf8(candidate.path);
    if (content === null) {
      continue;
    }
    filesScanned += 1;
    memories.push({
      kind: candidate.kind,
      path: path.relative(paths.workspacePath, candidate.path).replace(/\\/g, "/"),
      content,
    });
  }

  return {
    ...buildWorkspaceMemoryExcerpt({
      memories,
      maxChars: input.maxChars,
    }),
    filesScanned,
    memories,
  };
}

export function observeWorkspaceMemoryWrites(input: {
  before: WorkspaceMemoryState;
  after: WorkspaceMemoryState;
}): WorkspaceMemoryWriteObservation[] {
  const beforeByPath = new Map(input.before.entries.map((entry) => [entry.path, entry]));
  const observations: WorkspaceMemoryWriteObservation[] = [];

  for (const afterEntry of input.after.entries) {
    const beforeEntry = beforeByPath.get(afterEntry.path);
    const beforeHash = beforeEntry?.contentHash ?? null;
    const afterHash = afterEntry.contentHash;
    const changed = beforeHash !== afterHash;
    if (!changed) {
      continue;
    }

    observations.push({
      targetPath: afterEntry.path,
      changeType: afterEntry.changeType,
      changed,
      createdFile: beforeEntry?.exists !== true && afterEntry.exists,
      beforeHash,
      afterHash,
      summary:
        afterEntry.changeType === "long_term"
          ? "updated long-term workspace memory"
          : "updated daily workspace memory",
    });
  }

  return observations;
}

async function captureMemoryEntry(
  filePath: string,
  changeType: "long_term" | "daily",
): Promise<WorkspaceMemoryState["entries"][number]> {
  const content = await readOptionalUtf8(filePath);

  return {
    path: filePath,
    changeType,
    contentHash: content === null ? null : hashText(content),
    content: content ?? "",
    exists: content !== null,
  };
}

async function readOptionalUtf8(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function daysAgo(date: Date, offset: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() - offset);
  return copy;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
