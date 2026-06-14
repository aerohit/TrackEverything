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
  return postgres(databaseUrl, {
    // A small pool (not 1) so the page's parallel API calls don't serialize on one
    // socket, and a single wedged connection can't block every query on the isolate.
    // The Supabase transaction pooler handles this fine (with prepare:false).
    max: 4,
    prepare: false,
    // Fail fast instead of hanging the whole request (which Deno Deploy turns into a
    // DEPLOYMENT_TIMED_OUT) if the database is slow/unreachable.
    connect_timeout: 10,
    // Recycle connections quickly so we rarely reuse one the Supabase pooler has
    // silently half-dropped — a stale/half-open socket is what produced the recurring
    // "canceling statement due to statement timeout" (57014) errors on this
    // low-traffic app (long-idle connections are the ones that wedge).
    idle_timeout: 10,
    max_lifetime: 60 * 5,
  });
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
