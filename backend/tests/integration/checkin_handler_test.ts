import { assertEquals } from "@std/assert";
import { connect } from "../../src/db.ts";
import { applyMigrations } from "../../src/migrate.ts";
import { makeCheckinHandler } from "../../functions/checkin/index.ts";

const databaseUrl = Deno.env.get("DATABASE_URL");
const now = new Date("2026-06-12T12:00:00Z");

Deno.test({
  name: "checkin: stores one event per dimension with the right rating",
  ignore: !databaseUrl,
  async fn() {
    const sql = await connect(databaseUrl!);
    try {
      await applyMigrations(sql);
      const handler = makeCheckinHandler({ sql, token: null, now: () => now });

      const res = await handler(
        new Request("http://localhost/checkin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mood: 4, energy: 2, focus: 3, note: "post-lunch dip" }),
        }),
      );

      assertEquals(res.status, 201);
      const { events } = await res.json();
      assertEquals(events.length, 3);
      const ids: string[] = events.map((e: { id: string }) => e.id);

      const rows = await sql<{ category: string; rating: number }[]>`
        select category, (fields->>'rating')::int as rating
        from events where id = any(${ids}) order by category
      `;
      assertEquals([...rows], [
        { category: "energy", rating: 2 },
        { category: "focus", rating: 3 },
        { category: "mood", rating: 4 },
      ]);

      await sql`delete from events where id = any(${ids})`;
    } finally {
      await sql.end();
    }
  },
});
