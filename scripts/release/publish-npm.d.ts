export interface PublishResultEntry {
  name: string;
  path: string;
  registryRef: string;
  status: "failed" | "published" | "skipped_existing_version";
  summary: string;
  version: string | null;
}

export interface PublishReleaseSummary {
  generatedAt: string;
  includedPackages: string[];
  results: PublishResultEntry[];
  status: "failed" | "published";
  tagName: string | null;
  version: string | null;
}

export interface PublishReleaseOptions {
  rootDir?: string;
  npmCli?: string;
  summaryFile?: string | null;
  allowLogin?: boolean;
}

export function publishReleasePackages(
  options?: PublishReleaseOptions,
): Promise<PublishReleaseSummary>;
