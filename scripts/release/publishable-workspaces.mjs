import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  RELEASE_GROUP_PACKAGES,
  isReleaseGroupPackage,
} from "./release-group.mjs";

async function loadPackageJson(packageJsonPath) {
  return JSON.parse(await readFile(packageJsonPath, "utf8"));
}

async function listWorkspacePackageJsonFiles(rootDir) {
  const files = [];

  for (const base of ["apps", "packages"]) {
    const baseDir = path.join(rootDir, base);
    let children = [];
    try {
      children = await readdir(baseDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const child of children) {
      if (!child.isDirectory()) {
        continue;
      }
      files.push(path.join(baseDir, child.name, "package.json"));
    }
  }

  return files;
}

export async function listPublishableWorkspaces(rootDir = process.cwd()) {
  const packageJsonFiles = await listWorkspacePackageJsonFiles(rootDir);
  const results = [];

  for (const packageJsonFile of packageJsonFiles) {
    try {
      const pkg = await loadPackageJson(packageJsonFile);
      const privateFlag = pkg.private === true;
      const version = typeof pkg.version === "string" ? pkg.version : null;

      let eligible = true;
      let ineligibilityReason = null;

      if (!version) {
        eligible = false;
        ineligibilityReason = "missing_version";
      } else if (privateFlag) {
        eligible = false;
        ineligibilityReason = "private_package";
      } else if (!isReleaseGroupPackage(pkg.name)) {
        eligible = false;
        ineligibilityReason = "outside_release_group";
      }

      results.push({
        eligible,
        ineligibilityReason,
        name: pkg.name,
        path: path.relative(rootDir, path.dirname(packageJsonFile)),
        privateFlag,
        version,
      });
    } catch {
      continue;
    }
  }

  const releaseOrder = new Map(
    RELEASE_GROUP_PACKAGES.map((name, index) => [name, index]),
  );

  return results.sort((left, right) => {
    const leftOrder = releaseOrder.get(left.name) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = releaseOrder.get(right.name) ?? Number.MAX_SAFE_INTEGER;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.name.localeCompare(right.name);
  });
}

export async function listEligibleReleaseWorkspaces(rootDir = process.cwd()) {
  const results = await listPublishableWorkspaces(rootDir);
  return results.filter((entry) => entry.eligible);
}

export { RELEASE_GROUP_PACKAGES };

if (import.meta.main) {
  const results = await listPublishableWorkspaces(process.cwd());
  console.log(JSON.stringify(results, null, 2));
}
