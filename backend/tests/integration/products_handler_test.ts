import { assertEquals } from "@std/assert";
import { connect } from "../../src/db.ts";
import { applyMigrations } from "../../src/migrate.ts";
import { makeProductsHandler } from "../../functions/products/index.ts";

const databaseUrl = Deno.env.get("DATABASE_URL");

Deno.test({
  name: "products: create then GET ?name expands ingredients by servings",
  ignore: !databaseUrl,
  async fn() {
    const sql = await connect(databaseUrl!);
    const name = `sleep-stack-${crypto.randomUUID()}`;
    try {
      await applyMigrations(sql);
      const handler = makeProductsHandler({ sql, token: null });

      const create = await handler(
        new Request("http://localhost/products", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            category: "supplement",
            ingredients: [
              { name: "Magnesium Glycinate", amount: 200, unit: "mg" },
              { name: "L-Theanine", amount: 100, unit: "mg" },
            ],
          }),
        }),
      );
      assertEquals(create.status, 201);
      const product = await create.json();
      assertEquals(product.ingredients.length, 2);
      const itemId = product.id;

      // GET with servings=2 → amounts doubled.
      const get = await handler(
        new Request(`http://localhost/products?name=${encodeURIComponent(name)}&servings=2`),
      );
      assertEquals(get.status, 200);
      const { product: got, expanded } = await get.json();
      assertEquals(got.id, itemId);
      assertEquals(expanded.map((e: { amount: number }) => e.amount), [400, 200]);
      assertEquals(expanded[0].canonical_name, "magnesium glycinate");

      await sql`delete from items where id = ${itemId}`; // cascades to ingredients
    } finally {
      await sql.end();
    }
  },
});
