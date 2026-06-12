/**
 * Database access helpers. The `postgres` driver is imported lazily so importing
 * this module costs nothing until a connection is actually opened (keeps unit
 * tests offline).
 */
import type { Sql } from "npm:postgres@^3.4.4";

/** Open a pooled connection (max 1) to the given Postgres URL. */
export async function connect(databaseUrl: string): Promise<Sql> {
  const { default: postgres } = await import("npm:postgres@^3.4.4");
  return postgres(databaseUrl, { max: 1 });
}

/** Open a connection, run `select 1`, and report whether it succeeded. */
export async function pingDatabase(databaseUrl: string): Promise<boolean> {
  const sql = await connect(databaseUrl);
  try {
    const rows = await sql<{ ok: number }[]>`select 1 as ok`;
    return rows[0]?.ok === 1;
  } finally {
    await sql.end();
  }
}
