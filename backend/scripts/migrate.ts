/**
 * Apply database migrations. Run with: `deno task migrate` (needs DATABASE_URL).
 */
import { loadConfig } from "../src/config.ts";
import { connect } from "../src/db.ts";
import { applyMigrations } from "../src/migrate.ts";

const cfg = loadConfig();
if (!cfg.databaseUrl) {
  console.error("DATABASE_URL is not set. Set it in backend/.env or the environment.");
  Deno.exit(1);
}

const sql = await connect(cfg.databaseUrl);
try {
  const applied = await applyMigrations(sql);
  console.log(`Applied migrations: ${applied.join(", ") || "(none found)"}`);
} finally {
  await sql.end();
}
