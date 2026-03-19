export interface PublishableWorkspaceEntry {
  eligible: boolean;
  ineligibilityReason:
    | "missing_version"
    | "outside_release_group"
    | "private_package"
    | null;
  name: string;
  path: string;
  privateFlag: boolean;
  version: string | null;
}

export const RELEASE_GROUP_PACKAGES: string[];

export function listPublishableWorkspaces(
  rootDir?: string,
): Promise<PublishableWorkspaceEntry[]>;

export function listEligibleReleaseWorkspaces(
  rootDir?: string,
): Promise<PublishableWorkspaceEntry[]>;
