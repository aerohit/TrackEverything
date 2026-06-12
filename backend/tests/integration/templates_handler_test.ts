import { assert, assertEquals } from "@std/assert";
import { connect } from "../../src/db.ts";
import { applyMigrations } from "../../src/migrate.ts";
import { makeTemplatesHandler } from "../../functions/templates/index.ts";

const databaseUrl = Deno.env.get("DATABASE_URL");

Deno.test({
  name: "templates: create then list includes it",
  ignore: !databaseUrl,
  async fn() {
    const sql = await connect(databaseUrl!);
    try {
      await applyMigrations(sql);
      const handler = makeTemplatesHandler({ sql, token: null });
      const name = `test-tmpl-${crypto.randomUUID()}`;

      const create = await handler(
        new Request("http://localhost/templates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            category: "drink",
            defaultFields: { item: "coffee", caffeine_mg: 120 },
          }),
        }),
      );
      assertEquals(create.status, 201);
      const created = await create.json();
      assertEquals(created.name, name);

      const list = await handler(new Request("http://localhost/templates", { method: "GET" }));
      assertEquals(list.status, 200);
      const { templates } = await list.json();
      assert(
        templates.some((t: { id: string }) => t.id === created.id),
        "expected the new template in the list",
      );

      await sql`delete from templates where id = ${created.id}`;
    } finally {
      await sql.end();
    }
  },
});
