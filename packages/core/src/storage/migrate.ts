import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { PostgresClient } from "./repositories.ts";

const MIGRATIONS_DIR = resolve(import.meta.dir, "migrations");
const MIGRATION_LOCK_FAMILY = 20260308;
const MIGRATION_LOCK_KEY = 1;

type MigrationCapablePostgresClient = PostgresClient & {
  withConnection?: <T>(handler: (client: PostgresClient) => Promise<T>) => Promise<T>;
};

export async function runPostgresMigrations(client: PostgresClient): Promise<void> {
  const migrationFiles = (await readdir(MIGRATIONS_DIR))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
  const sqlStatements = await Promise.all(
    migrationFiles.map(async (fileName) => readFile(resolve(MIGRATIONS_DIR, fileName), "utf8")),
  );
  const migrationClient = client as MigrationCapablePostgresClient;

  if (!migrationClient.withConnection) {
    for (const sql of sqlStatements) {
      await client.query(sql);
    }
    return;
  }

  await migrationClient.withConnection(async (connection) => {
    await connection.query("SELECT pg_advisory_lock($1, $2)", [MIGRATION_LOCK_FAMILY, MIGRATION_LOCK_KEY]);

    try {
      for (const sql of sqlStatements) {
        await connection.query(sql);
      }
    } finally {
      await connection.query("SELECT pg_advisory_unlock($1, $2)", [MIGRATION_LOCK_FAMILY, MIGRATION_LOCK_KEY]);
    }
  });
}
