import { assert, assertEquals } from "@std/assert";
import { connect } from "../../src/db.ts";
import { applyMigrations } from "../../src/migrate.ts";
import { getEvent, insertEvent } from "../../src/events.ts";

// Real insert -> read roundtrip against Postgres. Runs when DATABASE_URL is set
// (CI service container, or a local Postgres); skipped otherwise (R-TEST-2).
const databaseUrl = Deno.env.get("DATABASE_URL");

Deno.test({
  name: "events: insert -> read preserves dual timestamps, source, and JSON fields",
  ignore: !databaseUrl,
  async fn() {
    const sql = await connect(databaseUrl!);
    try {
      await applyMigrations(sql);

      // 5 hours ago: a thing that happened earlier and is being logged now.
      const occurredAt = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const fields = { item: "coffee", caffeine_mg: 120, notes: { mood: "ok" } };

      const saved = await insertEvent(sql, {
        category: "drink",
        occurredAt,
        occurredAtConfidence: "inferred",
        source: "manual",
        fields,
        rawText: "had my coffee at 10am",
      });

      assert(saved.id.length > 0, "expected a generated id");
      assertEquals(saved.occurred_at.getTime(), occurredAt.getTime());
      // recorded_at defaulted to ~now, i.e. after the event occurred.
      assert(saved.recorded_at.getTime() >= occurredAt.getTime());
      assertEquals(saved.occurred_at_confidence, "inferred");
      assertEquals(saved.source, "manual");
      assertEquals(saved.fields, fields); // nested JSON survives the roundtrip
      assertEquals(saved.raw_text, "had my coffee at 10am");

      const readBack = await getEvent(sql, saved.id);
      assert(readBack !== null, "expected to read the event back");
      assertEquals(readBack!.fields, fields);
      assertEquals(readBack!.occurred_at.getTime(), occurredAt.getTime());

      // Clean up so the test is repeatable against a persistent database.
      await sql`delete from events where id = ${saved.id}`;
    } finally {
      await sql.end();
    }
  },
});

if (!databaseUrl) {
  console.info("[events_test] DATABASE_URL not set — skipping the DB roundtrip test.");
}
