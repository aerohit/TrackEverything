import { assert, assertEquals } from "@std/assert";
import { connect } from "../db/client.ts";
import { migrate } from "../db/migrate.ts";
import { createApp } from "./app.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const TOKEN = "test-token";
const auth = { authorization: "Bearer " + TOKEN, "content-type": "application/json" };
const DAY = "from=2026-06-15T00:00:00Z&to=2026-06-16T00:00:00Z";

// deno-lint-ignore no-explicit-any
function byName(list: any[]): Map<string, number> {
  return new Map(list.map((x) => [x.substance, x.amount]));
}

Deno.test({
  // Needs a real Postgres; auto-skips locally without DATABASE_URL (runs in CI).
  name: "inputs API: substances, items, logging, totals, edit, soft-delete, auth",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL);
    const { sql, db } = connect(DATABASE_URL);
    const app = createApp(db, { token: TOKEN });
    try {
      await sql`truncate resolved_amount, intake_event, item_component, input_item cascade`;

      // Auth is enforced.
      assertEquals(
        (await app.request("/api/items", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })).status,
        401,
      );

      // The seeded vocabulary is listed.
      const subs =
        (await (await app.request("/api/substances", { headers: auth })).json()).substances;
      assert(subs.length >= 20 && subs.some((s: { name: string }) => s.name === "caffeine"));

      // Create a product; the response carries its resolved components.
      const created = await app.request("/api/items", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          name: "My Pre-workout",
          kind: "product",
          primaryType: "supplement",
          roles: ["stimulant"],
          defaultServing: {
            displayQuantity: 1,
            displayUnit: "scoop",
            canonicalQuantity: 12,
            canonicalUnit: "g",
          },
          components: [{ substance: "caffeine", amount: 200, unit: "mg" }, {
            substance: "creatine",
            amount: 5,
            unit: "g",
          }],
        }),
      });
      assertEquals(created.status, 201);
      const item = await created.json();
      assertEquals(item.components.length, 2);

      // An unknown substance → 400.
      assertEquals(
        (await app.request("/api/items", {
          method: "POST",
          headers: auth,
          body: JSON.stringify({
            name: "x",
            kind: "simple",
            primaryType: "food",
            components: [{ substance: "unobtainium", amount: 1, unit: "g" }],
          }),
        })).status,
        400,
      );

      // Item search finds it.
      assertEquals(
        (await (await app.request("/api/items?search=pre", { headers: auth })).json()).items.length,
        1,
      );

      // Log 1 scoop → resolved snapshot in the response.
      const logged = await app.request("/api/intake", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          displayName: "Pre-workout",
          itemId: item.id,
          quantity: 1,
          unit: "scoop",
          occurredAt: "2026-06-15T16:00:00.000Z",
          contextTags: ["pre_workout"],
          confidence: "high",
        }),
      });
      assertEquals(logged.status, 201);
      const ev = await logged.json();
      assertEquals(byName(ev.resolved).get("caffeine"), 200);

      // Freeform coffee with a manual caffeine amount (no item).
      await app.request("/api/intake", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          displayName: "Coffee",
          quantity: 1,
          unit: "cup",
          occurredAt: "2026-06-15T07:00:00.000Z",
          resolved: [{ substance: "caffeine", amount: 120, unit: "mg" }],
        }),
      });

      // List + daily totals.
      assertEquals(
        (await (await app.request(`/api/intake?${DAY}`, { headers: auth })).json()).events.length,
        2,
      );
      const totals =
        (await (await app.request(`/api/intake/totals?${DAY}`, { headers: auth })).json()).totals;
      assertEquals(byName(totals).get("caffeine"), 320); // 200 pre + 120 coffee

      // totals requires the window.
      assertEquals((await app.request("/api/intake/totals", { headers: auth })).status, 400);

      // Edit → 2 scoops, re-resolves.
      const patched = await app.request(`/api/intake/${ev.id}`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ quantity: 2, unit: "scoop" }),
      });
      assertEquals(patched.status, 200);
      assertEquals(byName((await patched.json()).resolved).get("caffeine"), 400);

      // Soft-delete → drops from totals; second delete is 404.
      assertEquals(
        (await app.request(`/api/intake/${ev.id}`, { method: "DELETE", headers: auth })).status,
        204,
      );
      assertEquals(
        (await app.request(`/api/intake/${ev.id}`, { method: "DELETE", headers: auth })).status,
        404,
      );
      const after =
        (await (await app.request(`/api/intake/totals?${DAY}`, { headers: auth })).json()).totals;
      assertEquals(byName(after).get("caffeine"), 120); // only the coffee remains
    } finally {
      await sql.end();
    }
  },
});
