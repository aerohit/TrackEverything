import { assertEquals } from "@std/assert";
import { connect } from "../../src/db.ts";
import { applyMigrations } from "../../src/migrate.ts";
import { createProduct } from "../../src/products.ts";
import { makeQuicklogHandler } from "../../functions/quicklog/index.ts";

const databaseUrl = Deno.env.get("DATABASE_URL");
const now = new Date("2026-06-12T12:00:00Z");

Deno.test({
  name: "quicklog: logging a product by name stores an event linked to it (item_id + servings)",
  ignore: !databaseUrl,
  async fn() {
    const sql = await connect(databaseUrl!);
    const name = `sleep-stack-${crypto.randomUUID()}`;
    try {
      await applyMigrations(sql);
      const product = await createProduct(sql, {
        name,
        category: "supplement",
        ingredients: [
          { name: "Magnesium Glycinate", amount: 200, unit: "mg" },
          { name: "L-Theanine", amount: 100, unit: "mg" },
        ],
      });

      const handler = makeQuicklogHandler({ sql, token: null, now: () => now });
      const res = await handler(
        new Request("http://localhost/quicklog", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ template: undefined, product: name, servings: 2 }),
        }),
      );

      assertEquals(res.status, 201);
      const saved = await res.json();
      assertEquals(saved.category, "supplement");
      assertEquals(saved.source, "quicklog");
      assertEquals(saved.item_id, product.id);
      assertEquals(saved.fields.servings, 2);
      assertEquals(new Date(saved.occurred_at).getTime(), now.getTime());

      await sql`delete from events where item_id = ${product.id}`;
      await sql`delete from items where id = ${product.id}`;
    } finally {
      await sql.end();
    }
  },
});
