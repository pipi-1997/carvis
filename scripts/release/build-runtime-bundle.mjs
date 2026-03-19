#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const templatePath = path.resolve(import.meta.dirname, "manifest-template.json");
const version = process.argv[2] ?? process.env.CARVIS_BUNDLE_VERSION ?? "dev";
const outDir = process.argv[3] ?? path.resolve(repoRoot, ".artifacts", "runtime-bundles", version);
const template = JSON.parse(await readFile(templatePath, "utf8"));

const manifest = {
  ...template,
  activeBundlePath: outDir,
  activeVersion: version,
  bundle: {
    ...template.bundle,
    bundlePath: outDir,
    components: {
      ...template.bundle.components,
      daemon: {
        program: process.execPath,
        args: ["--bun", path.resolve(repoRoot, "apps/daemon/src/index.ts")],
      },
      gateway: {
        program: process.execPath,
        args: ["--bun", path.resolve(repoRoot, "apps/gateway/src/index.ts")],
      },
      executor: {
        program: process.execPath,
        args: ["--bun", path.resolve(repoRoot, "apps/executor/src/index.ts")],
      },
    },
    platform: process.platform,
    version,
  },
  installRoot: path.resolve(outDir, "..", ".."),
  installedAt: new Date().toISOString(),
  lastRepairAt: null,
  platform: process.platform,
  serviceDefinitionPath: null,
  serviceManager: process.platform === "darwin" ? "launchd_user" : process.platform === "linux" ? "systemd_user" : null,
};

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${path.join(outDir, "manifest.json")}\n`);
