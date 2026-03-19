export interface ChangesetEntry {
  fileName: string;
  filePath: string;
  packages: string[];
  eligiblePackages: string[];
}

export const RELEASE_GROUP_PACKAGES: string[];

export function listChangesetEntries(
  changesetDir?: string,
): Promise<ChangesetEntry[]>;

export function hasEligibleChangesetEntries(
  changesetDir?: string,
  releaseGroupPackages?: string[],
): Promise<boolean>;
