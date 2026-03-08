import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { PostgresClient } from "./repositories.ts";

const INITIAL_MIGRATION_PATH = resolve(
  import.meta.dir,
  "migrations",
  "001_initial.sql",
);
const MIGRATION_LOCK_FAMILY = 20260308;
const MIGRATION_LOCK_KEY = 1;

type MigrationCapablePostgresClient = PostgresClient & {
  withConnection?: <T>(handler: (client: PostgresClient) => Promise<T>) => Promise<T>;
};

export async function runPostgresMigrations(client: PostgresClient): Promise<void> {
  const sql = await readFile(INITIAL_MIGRATION_PATH, "utf8");
  const migrationClient = client as MigrationCapablePostgresClient;

  if (!migrationClient.withConnection) {
    await client.query(sql);
    return;
  }

  await migrationClient.withConnection(async (connection) => {
    await connection.query("SELECT pg_advisory_lock($1, $2)", [MIGRATION_LOCK_FAMILY, MIGRATION_LOCK_KEY]);

    try {
      await connection.query(sql);
    } finally {
      await connection.query("SELECT pg_advisory_unlock($1, $2)", [MIGRATION_LOCK_FAMILY, MIGRATION_LOCK_KEY]);
    }
  });
}
