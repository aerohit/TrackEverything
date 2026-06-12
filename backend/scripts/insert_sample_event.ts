/**
 * Phase 1 acceptance helper: migrate, insert a sample event, read it back, and
 * print both — so you can see a row stored correctly. Run with `deno task seed`
 * (needs DATABASE_URL).
 *
 * The sample mimics an after-the-fact log: recorded now, but it happened a few
 * hours ago, so `occurred_at` precedes `recorded_at` and confidence is "inferred".
 */
import { loadConfig } from "../src/config.ts";
import { connect } from "../src/db.ts";
import { applyMigrations } from "../src/migrate.ts";
import { getEvent, insertEvent } from "../src/events.ts";

const cfg = loadConfig();
if (!cfg.databaseUrl) {
  console.error("DATABASE_URL is not set. Set it in backend/.env or the environment.");
  Deno.exit(1);
}

const sql = await connect(cfg.databaseUrl);
try {
  await applyMigrations(sql);

  const saved = await insertEvent(sql, {
    category: "drink",
    occurredAt: hoursAgo(3),
    occurredAtConfidence: "inferred",
    source: "manual",
    fields: { item: "coffee", caffeine_mg: 120 },
    rawText: "had my coffee a few hours ago",
  });

  console.log("Inserted event:");
  console.log(JSON.stringify(saved, null, 2));

  const readBack = await getEvent(sql, saved.id);
  console.log("\nRead back from the database:");
  console.log(JSON.stringify(readBack, null, 2));
} finally {
  await sql.end();
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}
