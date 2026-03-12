import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MEMORY_FILE_CONTENT = `# Workspace Memory

Use this file for stable workspace facts, decisions, preferences, and deprecated guidance.
Keep it curated: update or replace stale items instead of appending contradictions.

## Facts

## Decisions

## Preferences

## Avoid / Deprecated
`;

const CARVIS_README_CONTENT = `# Carvis Memory

Use \`MEMORY.md\` for long-term workspace knowledge.
Use dated files under \`memory/\` for same-day notes and recent context.
`;

const DAILY_MEMORY_README_CONTENT = `# Daily Memory

Create files named \`YYYY-MM-DD.md\` for same-day notes and recent context that may help future runs.
Do not use this folder for long-term durable facts; keep those in \`../MEMORY.md\`.
`;

export async function ensureWorkspaceTemplateScaffold(templatePath: string): Promise<void> {
  const paths = resolveTemplateScaffoldPaths(templatePath);

  await mkdir(paths.carvisDirPath, { recursive: true });
  await mkdir(paths.dailyMemoryDirPath, { recursive: true });
  await writeFileIfMissing(paths.carvisReadmePath, CARVIS_README_CONTENT);
  await writeFileIfMissing(paths.memoryPath, MEMORY_FILE_CONTENT);
  await writeFileIfMissing(paths.dailyMemoryReadmePath, DAILY_MEMORY_README_CONTENT);
}

export function ensureWorkspaceTemplateScaffoldSync(templatePath: string): void {
  const paths = resolveTemplateScaffoldPaths(templatePath);

  mkdirSync(paths.carvisDirPath, { recursive: true });
  mkdirSync(paths.dailyMemoryDirPath, { recursive: true });
  writeFileIfMissingSync(paths.carvisReadmePath, CARVIS_README_CONTENT);
  writeFileIfMissingSync(paths.memoryPath, MEMORY_FILE_CONTENT);
  writeFileIfMissingSync(paths.dailyMemoryReadmePath, DAILY_MEMORY_README_CONTENT);
}

function resolveTemplateScaffoldPaths(templatePath: string) {
  const root = path.resolve(templatePath);
  const carvisDirPath = path.join(root, ".carvis");
  const dailyMemoryDirPath = path.join(carvisDirPath, "memory");

  return {
    carvisDirPath,
    carvisReadmePath: path.join(carvisDirPath, "README.md"),
    dailyMemoryDirPath,
    dailyMemoryReadmePath: path.join(dailyMemoryDirPath, "README.md"),
    memoryPath: path.join(carvisDirPath, "MEMORY.md"),
  };
}

async function writeFileIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await writeFile(filePath, content, { flag: "wx" });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code !== "EEXIST") {
      throw error;
    }
  }
}

function writeFileIfMissingSync(filePath: string, content: string): void {
  try {
    writeFileSync(filePath, content, { flag: "wx" });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: string }).code : undefined;
    if (code !== "EEXIST") {
      throw error;
    }
  }
}
