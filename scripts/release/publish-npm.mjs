import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import {
  listEligibleReleaseWorkspaces,
} from "./publishable-workspaces.mjs";
import { getUnifiedReleaseVersion } from "./release-group.mjs";

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });

  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function ensureNpmLogin(npmCli) {
  const whoami = runCommand(npmCli, ["whoami"]);
  if (whoami.exitCode === 0) {
    return;
  }

  const login = runCommand(npmCli, ["login"], {
    stdio: "inherit",
  });
  if (login.exitCode !== 0) {
    throw new Error("npm login failed");
  }
}

export async function publishReleasePackages({
  rootDir = process.cwd(),
  npmCli = "npm",
  summaryFile = null,
  allowLogin = process.env.CI !== "true",
} = {}) {
  if (allowLogin) {
    ensureNpmLogin(npmCli);
  }

  const workspaces = await listEligibleReleaseWorkspaces(rootDir);
  const version = getUnifiedReleaseVersion(workspaces);
  const tagName = version ? `v${version}` : null;

  const results = [];

  for (const workspace of workspaces) {
    const packageSpec = `${workspace.name}@${workspace.version}`;
    const cwd = path.join(rootDir, workspace.path);
    const existing = runCommand(npmCli, ["view", packageSpec, "version"]);

    if (existing.exitCode === 0) {
      results.push({
        name: workspace.name,
        path: workspace.path,
        registryRef: packageSpec,
        status: "skipped_existing_version",
        summary: `${packageSpec} already exists in registry`,
        version: workspace.version,
      });
      continue;
    }

    const published = runCommand(npmCli, ["publish", "--access", "public"], {
      cwd,
    });

    if (published.exitCode === 0) {
      results.push({
        name: workspace.name,
        path: workspace.path,
        registryRef: packageSpec,
        status: "published",
        summary: `${packageSpec} published`,
        version: workspace.version,
      });
      continue;
    }

    results.push({
      name: workspace.name,
      path: workspace.path,
      registryRef: packageSpec,
      status: "failed",
      summary: `${packageSpec} publish failed`,
      version: workspace.version,
    });
  }

  const status = results.some((entry) => entry.status === "failed")
    ? "failed"
    : "published";

  const summary = {
    generatedAt: new Date().toISOString(),
    includedPackages: workspaces.map((entry) => entry.name),
    results,
    status,
    tagName,
    version,
  };

  if (summaryFile) {
    await writeFile(summaryFile, JSON.stringify(summary, null, 2));
  }

  return summary;
}

if (import.meta.main) {
  const summaryFile = process.env.CARVIS_RELEASE_SUMMARY_FILE ?? null;
  const result = await publishReleasePackages({
    summaryFile,
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "failed") {
    process.exitCode = 1;
  }
}
