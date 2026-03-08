import { Pool, type PoolClient } from "pg";

import type { PostgresClient } from "./repositories.ts";

export interface RuntimePostgresClient extends PostgresClient {
  close(): Promise<void>;
  connectionString: string;
  ping(): Promise<boolean>;
  withConnection?<T>(handler: (client: PostgresClient) => Promise<T>): Promise<T>;
}

export async function createPostgresClient(connectionString: string): Promise<RuntimePostgresClient> {
  const pool = new Pool({
    connectionString,
  });

  await pool.query("SELECT 1");

  function wrapClient(client: Pool | PoolClient): PostgresClient {
    return {
      async query<T>(sql: string, params?: unknown[]) {
        const result = await client.query(sql, params);
        return {
          rows: result.rows as T[],
        };
      },
    };
  }

  return {
    async close() {
      await pool.end();
    },
    connectionString,
    async ping() {
      await pool.query("SELECT 1");
      return true;
    },
    async withConnection<T>(handler: (client: PostgresClient) => Promise<T>) {
      const client = await pool.connect();

      try {
        return await handler(wrapClient(client));
      } finally {
        client.release();
      }
    },
    async query<T>(sql: string, params?: unknown[]) {
      return wrapClient(pool).query<T>(sql, params);
    },
  };
}
