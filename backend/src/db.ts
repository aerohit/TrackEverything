/**
 * Database access helpers. The `postgres` driver is imported lazily so importing
 * this module costs nothing until a connection is actually opened (keeps unit
 * tests offline).
 */
import type { Sql } from "npm:postgres@^3.4.4";

/**
 * Open a connection to the given Postgres URL. `prepare: false` keeps us
 * compatible with Supabase's connection pooler (Supavisor / transaction mode),
 * which doesn't support prepared statements; it's harmless on a direct
 * connection. Transactions (`sql.begin`) still work in either mode.
 */
export async function connect(databaseUrl: string): Promise<Sql> {
  const { default: postgres } = await import("npm:postgres@^3.4.4");
  return postgres(databaseUrl, { max: 1, prepare: false });
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
