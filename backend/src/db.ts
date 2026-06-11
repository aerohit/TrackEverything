/**
 * Minimal database connectivity check for Phase 0. The real event-log schema
 * and queries arrive in Phase 1; here we only prove that the backend can reach
 * a Postgres instance.
 *
 * The `postgres` driver is imported lazily so importing this module costs
 * nothing until an actual connection is made.
 */

/** Open a connection, run `select 1`, and report whether it succeeded. */
export async function pingDatabase(databaseUrl: string): Promise<boolean> {
  const { default: postgres } = await import("npm:postgres@^3.4.4");
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const rows = await sql`select 1 as ok`;
    return rows[0]?.ok === 1;
  } finally {
    await sql.end();
  }
}
