#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { builtinModules } from "node:module";

const ROOT_DIR = path.resolve(new URL(".", import.meta.url).pathname, "..");

const DEFAULT_PACKAGES = [
  "packages/core",
  "packages/channel-feishu",
  "packages/bridge-codex",
  "packages/carvis-schedule-cli",
  "apps/gateway",
  "apps/executor",
  "packages/carvis-cli",
];

const builtinSet = new Set(
  builtinModules.flatMap((name) => [name, `node:${name.replace(/^node:/, "")}`]),
);

const importPatterns = [
  /(?:import|export)\s+[^"'`]*?\sfrom\s*["'`]([^"'`]+)["'`]/g,
  /import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  /require\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
];

function normalizeFsPath(filePath) {
  if (process.platform === "win32" && filePath.startsWith("/")) {
    return filePath.slice(1);
  }
  return filePath;
}

function isExternalPackage(specifier) {
  if (!specifier || specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("#")) {
    return false;
  }
  return true;
}

function getPackageName(specifier) {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return specifier.split("/")[0];
}

async function readJson(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function walkFiles(dir, result) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, result);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      continue;
    }
    result.push(fullPath);
  }
}

function collectImports(source) {
  const imports = new Set();
  for (const pattern of importPatterns) {
    pattern.lastIndex = 0;
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]?.trim();
      if (!specifier || !isExternalPackage(specifier)) {
        continue;
      }
      imports.add(getPackageName(specifier));
    }
  }
  return imports;
}

async function checkPackage(packageRelPath) {
  const packageDir = path.join(ROOT_DIR, packageRelPath);
  const packageJsonPath = path.join(packageDir, "package.json");
  const packageJson = await readJson(packageJsonPath);

  const declared = new Set([
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ]);

  const filesToScan = [];
  await walkFiles(path.join(packageDir, "src"), filesToScan);
  await walkFiles(path.join(packageDir, "bin"), filesToScan);

  const missingByFile = [];

  for (const filePath of filesToScan) {
    const content = await fs.readFile(filePath, "utf8");
    const imports = collectImports(content);
    const missing = [...imports].filter((pkg) => !declared.has(pkg) && !builtinSet.has(pkg));
    if (missing.length > 0) {
      missingByFile.push({
        filePath: path.relative(ROOT_DIR, filePath),
        missing,
      });
    }
  }

  return {
    packageName: packageJson.name ?? packageRelPath,
    packageRelPath,
    missingByFile,
  };
}

async function main() {
  const packageList = process.argv.slice(2);
  const targets = packageList.length > 0 ? packageList : DEFAULT_PACKAGES;

  const failures = [];
  for (const relPath of targets) {
    const packageDir = path.join(ROOT_DIR, relPath);
    const packageJsonPath = path.join(packageDir, "package.json");
    try {
      await fs.access(packageJsonPath);
    } catch {
      console.log(`- skip ${relPath} (missing package.json)`);
      continue;
    }

    const result = await checkPackage(relPath);
    if (result.missingByFile.length > 0) {
      failures.push(result);
    }
  }

  if (failures.length === 0) {
    console.log("publish runtime dependency check passed.");
    return;
  }

  console.error("publish runtime dependency check failed:");
  for (const failure of failures) {
    console.error(`\n[${failure.packageName}] ${failure.packageRelPath}`);
    for (const item of failure.missingByFile) {
      console.error(`  - ${normalizeFsPath(item.filePath)} -> missing: ${item.missing.join(", ")}`);
    }
  }

  process.exit(1);
}

main().catch((error) => {
  console.error("failed to run dependency check:", error);
  process.exit(1);
});
