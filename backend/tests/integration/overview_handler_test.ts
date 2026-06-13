import { assert, assertEquals } from "@std/assert";
import { connect } from "../../src/db.ts";
import { applyMigrations } from "../../src/migrate.ts";
import { insertEvent } from "../../src/events.ts";
import { createProduct } from "../../src/products.ts";
import { makeOverviewHandler } from "../../functions/overview/index.ts";

const databaseUrl = Deno.env.get("DATABASE_URL");

Deno.test({
  name: "GET /overview: aggregates a day incl. caffeine, subjective, and expanded ingredients",
  ignore: !databaseUrl,
  async fn() {
    const sql = await connect(databaseUrl!);
    try {
      await applyMigrations(sql);
      await sql`delete from events`; // isolate this day's window

      const product = await createProduct(sql, {
        name: "sleep-stack-" + crypto.randomUUID(),
        category: "supplement",
        ingredients: [{ name: "Magnesium Glycinate", amount: 200, unit: "mg" }],
      });

      await insertEvent(sql, {
        category: "drink",
        occurredAt: "2026-06-12T08:00:00Z",
        source: "manual",
        fields: { caffeine_mg: 120 },
      });
      await insertEvent(sql, {
        category: "mood",
        occurredAt: "2026-06-12T09:00:00Z",
        source: "manual",
        fields: { rating: 4 },
      });
      await insertEvent(sql, {
        category: "supplement",
        occurredAt: "2026-06-12T22:00:00Z",
        source: "quicklog",
        itemId: product.id,
        fields: { servings: 2 },
      });

      const handler = makeOverviewHandler({ sql, token: null });
      const res = await handler(new Request("http://x/overview?date=2026-06-12"));

      assertEquals(res.status, 200);
      const s = await res.json();
      assertEquals(s.date, "2026-06-12");
      assertEquals(s.caffeineMg, 120);
      assertEquals(s.subjective.mood.avg, 4);
      const mag = s.ingredients.find((i: { canonical_name: string }) =>
        i.canonical_name === "magnesium glycinate"
      );
      assert(mag, "expected magnesium in the ingredient rollup");
      assertEquals(mag.amount, 400); // 200 * 2 servings

      await sql`delete from events`;
      await sql`delete from items where id = ${product.id}`;
    } finally {
      await sql.end();
    }
  },
});
