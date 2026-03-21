import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import {
  listEligibleReleaseWorkspaces,
} from "./publishable-workspaces.mjs";
import { getUnifiedReleaseVersion } from "./release-group.mjs";

function truncate(text, max = 4000) {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n... (truncated ${text.length - max} chars)`;
}

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

function hasGitHubOidcEnv() {
  return Boolean(
    process.env.ACTIONS_ID_TOKEN_REQUEST_URL &&
      process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,
  );
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

    // GitHub OIDC trusted publishing requires provenance to mint the ephemeral token.
    // Locally we keep the publish args minimal to avoid surprising maintainers.
    const publishArgs = ["publish", "--access", "public"];
    if (hasGitHubOidcEnv()) {
      publishArgs.push("--provenance");
    }

    const published = runCommand(npmCli, publishArgs, {
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

    // Surface npm publish diagnostics in CI logs (and in the JSON summary) so
    // we can see whether the failure is trusted publishing setup, access, etc.
    const diag = {
      exitCode: published.exitCode,
      stdout: truncate(published.stdout),
      stderr: truncate(published.stderr),
    };
    process.stderr.write(
      `[npm publish] ${packageSpec} failed\n${JSON.stringify(diag, null, 2)}\n`,
    );

    results.push({
      name: workspace.name,
      path: workspace.path,
      registryRef: packageSpec,
      status: "failed",
      summary: `${packageSpec} publish failed`,
      diagnostics: diag,
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
