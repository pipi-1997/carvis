import { readdir, readFile } from "node:fs/promises";

import type { MemoryBenchmarkCase } from "../../packages/core/src/domain/memory-benchmark.ts";

export async function loadMemoryBenchmarkFixtures(root: string): Promise<MemoryBenchmarkCase[]> {
  const files = (await readdir(root)).filter((file) => file.endsWith(".json")).sort();
  const fixtures = await Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(`${root}/${file}`, "utf8")) as MemoryBenchmarkCase,
    ),
  );

  for (const fixture of fixtures) {
    if (!fixture.id || !fixture.workspaceKey || fixture.transcript.length === 0 || !fixture.expectation) {
      throw new Error(`invalid memory benchmark fixture: ${fixture.id || "(missing id)"}`);
    }
  }

  return fixtures;
}
