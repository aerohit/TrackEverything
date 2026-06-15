/**
 * Tiny migration runner: applies db/migrations/*.sql in filename order, once
 * each, tracked in a `schema_migrations` table. Run with `deno task migrate`
 * (needs DATABASE_URL). Idempotent — already-applied files are skipped.
 *
 * (drizzle-kit can generate migrations later; this keeps application a single
 * Deno step with no Node toolchain, matching how the MVP ran migrations.)
 */
import postgres from "postgres";

const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url);

export async function migrate(databaseUrl: string | undefined = Deno.env.get("DATABASE_URL")) {
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const sql = postgres(databaseUrl, { prepare: false, max: 1, onnotice: () => {} });
  try {
    await sql`create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`;
    const applied = new Set(
      (await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name),
    );

    const files = [...Deno.readDirSync(MIGRATIONS_DIR)]
      .filter((e) => e.isFile && e.name.endsWith(".sql"))
      .map((e) => e.name)
      .sort();

    const run: string[] = [];
    for (const name of files) {
      if (applied.has(name)) continue;
      const ddl = await Deno.readTextFile(new URL(name, MIGRATIONS_DIR));
      await sql.unsafe(ddl);
      await sql`insert into schema_migrations ${sql({ name })}`;
      run.push(name);
    }
    return run;
  } finally {
    await sql.end();
  }
}

if (import.meta.main) {
  const run = await migrate();
  console.log(run.length ? `Applied migrations: ${run.join(", ")}` : "No migrations to apply.");
}
