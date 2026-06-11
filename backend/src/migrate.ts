/**
 * Tiny forward-only migration runner. Reads the `.sql` files in `migrations/` in
 * filename order and executes each statement. Idempotent because the migrations
 * themselves use `create table/index if not exists`.
 *
 * Statements are split on `;` after stripping full-line `--` comments. The Phase
 * 1 migrations are plain DDL with no semicolons inside statement bodies, so this
 * simple split is safe; if we ever add functions/`DO $$` blocks we'll switch to a
 * proper parser.
 */
import type { Sql } from "npm:postgres@^3.4.4";

const DEFAULT_MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);

/** Apply every migration file in `migrationsDir`; returns the filenames applied. */
export async function applyMigrations(
  sql: Sql,
  migrationsDir: URL = DEFAULT_MIGRATIONS_DIR,
): Promise<string[]> {
  const names = [...Deno.readDirSync(migrationsDir)]
    .filter((entry) => entry.isFile && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  const applied: string[] = [];
  for (const name of names) {
    const text = await Deno.readTextFile(new URL(name, migrationsDir));
    const statements = text
      .replace(/^\s*--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const statement of statements) {
      await sql.unsafe(statement);
    }
    applied.push(name);
  }
  return applied;
}
