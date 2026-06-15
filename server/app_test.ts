import { assert, assertEquals } from "@std/assert";
import { connect } from "../db/client.ts";
import { migrate } from "../db/migrate.ts";
import { createApp } from "./app.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const TOKEN = "test-token";
const auth = { authorization: "Bearer " + TOKEN, "content-type": "application/json" };

Deno.test({
  // Needs a real Postgres; auto-skips locally without DATABASE_URL (runs in CI).
  name: "checkins API: auth + create/list/edit/soft-delete roundtrip",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL);
    const { sql, db } = connect(DATABASE_URL);
    const app = createApp(db, { token: TOKEN });
    try {
      await sql`truncate subjective_state`;

      // Auth is enforced.
      const noAuth = await app.request("/api/checkins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mood: 3 }),
      });
      assertEquals(noAuth.status, 401);

      // Create a snapshot rating a subset of dimensions.
      const created = await app.request("/api/checkins", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          mood: 4,
          energy: 3,
          note: "good",
          occurredAt: "2026-06-15T08:00:00Z",
        }),
      });
      assertEquals(created.status, 201);
      const c = await created.json();
      assertEquals([c.mood, c.energy, c.focus], [4, 3, null]);
      assert(c.id && c.occurredAt === "2026-06-15T08:00:00.000Z");

      // An empty check-in is rejected.
      const bad = await app.request("/api/checkins", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ note: "x" }),
      });
      assertEquals(bad.status, 400);

      // List shows the one live row.
      const listed = await (await app.request("/api/checkins", { headers: auth })).json();
      assertEquals(listed.checkins.length, 1);

      // Edit it.
      const patched = await app.request(`/api/checkins/${c.id}`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ focus: 5 }),
      });
      assertEquals(patched.status, 200);
      assertEquals((await patched.json()).focus, 5);

      // Editing a missing row is a 404.
      const miss = await app.request(`/api/checkins/${crypto.randomUUID()}`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ focus: 1 }),
      });
      assertEquals(miss.status, 404);

      // Soft-delete hides it from the list.
      assertEquals(
        (await app.request(`/api/checkins/${c.id}`, { method: "DELETE", headers: auth })).status,
        204,
      );
      const after = await (await app.request("/api/checkins", { headers: auth })).json();
      assertEquals(after.checkins.length, 0);

      // Row still exists in the table (soft delete, not hard).
      const [{ count }] = await sql`select count(*)::int from subjective_state`;
      assertEquals(count, 1);

      // Deleting again is a 404.
      assertEquals(
        (await app.request(`/api/checkins/${c.id}`, { method: "DELETE", headers: auth })).status,
        404,
      );
    } finally {
      await sql.end();
    }
  },
});
