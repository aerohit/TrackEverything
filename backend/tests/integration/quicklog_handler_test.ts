import { assertEquals } from "@std/assert";
import { connect } from "../../src/db.ts";
import { applyMigrations } from "../../src/migrate.ts";
import { createTemplate } from "../../src/templates.ts";
import { makeQuicklogHandler } from "../../functions/quicklog/index.ts";

const databaseUrl = Deno.env.get("DATABASE_URL");
const now = new Date("2026-06-12T12:00:00Z");

Deno.test({
  name: "quicklog: known template expands to a stored event with merged fields",
  ignore: !databaseUrl,
  async fn() {
    const sql = await connect(databaseUrl!);
    const name = `test-coffee-${crypto.randomUUID()}`;
    try {
      await applyMigrations(sql);
      const template = await createTemplate(sql, {
        name,
        category: "drink",
        defaultFields: { item: "coffee", caffeine_mg: 120 },
      });

      const handler = makeQuicklogHandler({ sql, token: null, now: () => now });
      const res = await handler(
        new Request("http://localhost/quicklog", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ template: name, fields: { caffeine_mg: 80 } }),
        }),
      );

      assertEquals(res.status, 201);
      const saved = await res.json();
      assertEquals(saved.category, "drink");
      assertEquals(saved.source, "quicklog");
      assertEquals(saved.template_id, template.id);
      assertEquals(saved.fields, { item: "coffee", caffeine_mg: 80 }); // override applied
      assertEquals(new Date(saved.occurred_at).getTime(), now.getTime());

      const rows = await sql<{ n: number }[]>`
        select count(*)::int as n from events where template_id = ${template.id}
      `;
      assertEquals(rows[0].n, 1);

      await sql`delete from events where template_id = ${template.id}`;
      await sql`delete from templates where id = ${template.id}`;
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "quicklog: unknown template -> 404",
  ignore: !databaseUrl,
  async fn() {
    const sql = await connect(databaseUrl!);
    try {
      await applyMigrations(sql);
      const handler = makeQuicklogHandler({ sql, token: null });
      const res = await handler(
        new Request("http://localhost/quicklog", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ template: `nope-${crypto.randomUUID()}` }),
        }),
      );
      assertEquals(res.status, 404);
    } finally {
      await sql.end();
    }
  },
});
