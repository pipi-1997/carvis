export const RELEASE_GROUP_PACKAGES = [
  "@carvis/core",
  "@carvis/channel-feishu",
  "@carvis/bridge-codex",
  "@carvis/carvis-schedule-cli",
  "@carvis/gateway",
  "@carvis/executor",
  "@carvis/carvis-cli",
];

const RELEASE_GROUP_SET = new Set(RELEASE_GROUP_PACKAGES);

export function isReleaseGroupPackage(name) {
  return RELEASE_GROUP_SET.has(name);
}

export function getReleaseGroupPackages() {
  return [...RELEASE_GROUP_PACKAGES];
}

export function getUnifiedReleaseVersion(packages) {
  const versions = new Set(
    packages
      .filter((entry) => entry.eligible)
      .map((entry) => entry.version),
  );

  if (versions.size === 0) {
    return null;
  }

  if (versions.size > 1) {
    throw new Error(
      `release group versions diverged: ${JSON.stringify([...versions])}`,
    );
  }

  return [...versions][0] ?? null;
}
