import { assert, assertEquals } from "@std/assert";
import { connect } from "../../src/db.ts";
import { applyMigrations } from "../../src/migrate.ts";
import { makeEventsHandler } from "../../functions/events/index.ts";

// Full HTTP -> handler -> DB roundtrip. Runs when DATABASE_URL is set (CI / local
// Postgres); skipped otherwise (R-TEST-2).
const databaseUrl = Deno.env.get("DATABASE_URL");

Deno.test({
  name: "POST /events: valid payload (with token) is stored and returned as 201",
  ignore: !databaseUrl,
  async fn() {
    const sql = await connect(databaseUrl!);
    try {
      await applyMigrations(sql);
      const handler = makeEventsHandler({ sql, token: "test-token" });

      const res = await handler(
        new Request("http://localhost/events", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: "Bearer test-token",
          },
          body: JSON.stringify({
            category: "drink",
            occurredAt: "2026-06-12T08:00:00Z",
            source: "manual",
            fields: { item: "coffee", caffeine_mg: 120 },
            rawText: "logged via POST",
          }),
        }),
      );

      assertEquals(res.status, 201);
      const saved = await res.json();
      assert(typeof saved.id === "string" && saved.id.length > 0);
      assertEquals(saved.category, "drink");
      assertEquals(saved.source, "manual");
      assertEquals(saved.fields, { item: "coffee", caffeine_mg: 120 });

      // Confirm the row really landed in the database.
      const rows = await sql<{ n: number }[]>`
        select count(*)::int as n from events where id = ${saved.id}
      `;
      assertEquals(rows[0].n, 1);

      await sql`delete from events where id = ${saved.id}`;
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "POST /events: source defaults to manual when omitted",
  ignore: !databaseUrl,
  async fn() {
    const sql = await connect(databaseUrl!);
    try {
      await applyMigrations(sql);
      const handler = makeEventsHandler({ sql, token: null });

      const res = await handler(
        new Request("http://localhost/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            category: "note",
            occurredAt: "2026-06-12T08:00:00Z",
            fields: {},
          }),
        }),
      );

      assertEquals(res.status, 201);
      const saved = await res.json();
      assertEquals(saved.source, "manual");

      await sql`delete from events where id = ${saved.id}`;
    } finally {
      await sql.end();
    }
  },
});
