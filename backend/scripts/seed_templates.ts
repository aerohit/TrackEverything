/**
 * Insert a couple of example quick-log templates so there's something to tap.
 * Idempotent — skips any whose name already exists. Run with `deno task
 * templates:seed` (needs DATABASE_URL).
 */
import { loadConfig } from "../src/config.ts";
import { connect } from "../src/db.ts";
import { applyMigrations } from "../src/migrate.ts";
import { createTemplate, getTemplateByName, type NewTemplate } from "../src/templates.ts";

const EXAMPLES: NewTemplate[] = [
  { name: "my coffee", category: "drink", defaultFields: { item: "coffee", caffeine_mg: 120 } },
  {
    name: "my magnesium",
    category: "supplement",
    defaultFields: { item: "magnesium", dose_mg: 400 },
  },
];

const cfg = loadConfig();
if (!cfg.databaseUrl) {
  console.error("DATABASE_URL is not set. Set it in backend/.env or the environment.");
  Deno.exit(1);
}

const sql = await connect(cfg.databaseUrl);
try {
  await applyMigrations(sql);
  for (const t of EXAMPLES) {
    if (await getTemplateByName(sql, t.name)) {
      console.log(`skip: "${t.name}" already exists`);
      continue;
    }
    const created = await createTemplate(sql, t);
    console.log(`created: "${created.name}" (${created.id})`);
  }
} finally {
  await sql.end();
}
