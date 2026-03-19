import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { RELEASE_GROUP_PACKAGES, isReleaseGroupPackage } from "./release-group.mjs";

function parseFrontmatterPackages(text) {
  const lines = text.split("\n");
  if (lines[0] !== "---") {
    return [];
  }

  const packages = [];
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "---") {
      break;
    }

    const match = line.match(/^"(?<name>[^"]+)":\s*(patch|minor|major)$/);
    if (match?.groups?.name) {
      packages.push(match.groups.name);
    }
  }

  return packages;
}

export async function listChangesetEntries(
  changesetDir = path.join(process.cwd(), ".changeset"),
) {
  let fileNames = [];
  try {
    fileNames = await readdir(changesetDir);
  } catch {
    return [];
  }

  const entries = [];

  for (const fileName of fileNames.sort()) {
    if (!fileName.endsWith(".md")) {
      continue;
    }

    const filePath = path.join(changesetDir, fileName);
    const text = await readFile(filePath, "utf8");
    const packages = parseFrontmatterPackages(text);
    entries.push({
      fileName,
      filePath,
      packages,
      eligiblePackages: packages.filter((name) => isReleaseGroupPackage(name)),
    });
  }

  return entries;
}

export async function hasEligibleChangesetEntries(
  changesetDir = path.join(process.cwd(), ".changeset"),
  releaseGroupPackages = RELEASE_GROUP_PACKAGES,
) {
  const releaseGroup = new Set(releaseGroupPackages);
  const entries = await listChangesetEntries(changesetDir);
  return entries.some((entry) =>
    entry.packages.some((name) => releaseGroup.has(name))
  );
}

export { RELEASE_GROUP_PACKAGES };

if (import.meta.main) {
  const entries = await listChangesetEntries();
  console.log(JSON.stringify(entries, null, 2));
}
