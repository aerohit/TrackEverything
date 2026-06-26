import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { Db } from "../db/client.ts";
import { connect } from "../db/client.ts";
import { migrate } from "../db/migrate.ts";
import { createApp } from "./app.ts";
import type { AdviceContext } from "../shared/advice.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const TOKEN = "test-token";
const auth = { authorization: "Bearer " + TOKEN, "content-type": "application/json" };

Deno.test("API namespace always speaks JSON — unknown /api paths are a JSON 404, not the SPA shell", async () => {
  // No DB needed: the catch-all and auth never touch it.
  const app = createApp(null as unknown as Db, { token: TOKEN });

  for (
    const [method, path] of [["GET", "/api/bogus"], ["POST", "/api/nope"], [
      "DELETE",
      "/api/x/y",
    ]] as const
  ) {
    const res = await app.request(path, { method, headers: auth });
    assertEquals(res.status, 404, `${method} ${path}`);
    assert(
      res.headers.get("content-type")?.includes("application/json"),
      `${method} ${path} should be JSON`,
    );
    assertEquals((await res.json()).error, "not found");
  }

  // Auth still runs first: an unknown /api path without a token is 401, not 404.
  assertEquals((await app.request("/api/bogus")).status, 401);
});

Deno.test({
  name: "ask API: 503 unconfigured, 400 bad body, else answers over the last-48h context",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL);
    const { sql, db } = connect(DATABASE_URL);
    try {
      await sql`truncate resolved_amount, intake_event, item_component, input_item, subjective_state cascade`;

      // No advisor configured → 503.
      const noAdvisor = createApp(db, { token: TOKEN });
      assertEquals(
        (await noAdvisor.request("/api/ask", {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ question: "why?" }),
        })).status,
        503,
      );

      // A mock advisor that reports what context the route gathered.
      let captured: AdviceContext | null = null;
      const advisor = {
        answer: (a: { question: string; context: AdviceContext }) => {
          captured = a.context;
          return Promise.resolve(
            `Q:${a.question} checkins:${a.context.checkins.length} events:${a.context.events.length} window:${a.context.windowHours}`,
          );
        },
      };
      const app = createApp(db, { token: TOKEN, advisor });

      // Bad payload → 400.
      assertEquals(
        (await app.request("/api/ask", { method: "POST", headers: auth, body: "{}" })).status,
        400,
      );

      // Seed recent data (within the 48h window — use now-relative timestamps).
      await app.request("/api/checkins", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ readings: [{ kind: "energy", rating: 2 }] }),
      });
      await app.request("/api/intake", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          displayName: "Cold brew",
          quantity: 1,
          unit: "cup",
          occurredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          resolved: [{ substance: "caffeine", amount: 200, unit: "mg" }],
        }),
      });

      const res = await app.request("/api/ask", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ question: "Why is my energy low?" }),
      });
      assertEquals(res.status, 200);
      const { answer } = await res.json();
      assertStringIncludes(answer, "checkins:1");
      assertStringIncludes(answer, "events:1");
      assert(captured !== null && (captured as AdviceContext).windowHours === 48);
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  // Needs a real Postgres; auto-skips locally without DATABASE_URL (runs in CI).
  name: "checkins API: auth, batch create, list (+filters), immutability",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL);
    const { sql, db } = connect(DATABASE_URL);
    const app = createApp(db, { token: TOKEN });
    try {
      await sql`truncate subjective_state`;

      // Health is open (no token needed) at both / and /api, and ?warm=1 succeeds
      // (it runs a tiny DB query to keep the pooled connection warm).
      assertEquals((await app.request("/health")).status, 200);
      assertEquals((await app.request("/api/health")).status, 200);
      const warm = await app.request("/api/health?warm=1");
      assertEquals(warm.status, 200);
      const warmBody = await warm.json();
      assertEquals(warmBody.ok, true);
      assertEquals(warmBody.env, "dev"); // default when APP_ENV unset
      // The configured environment is surfaced for the PWA's non-prod banner.
      const prod = createApp(db, { token: TOKEN, env: "prod" });
      assertEquals((await (await prod.request("/health")).json()).env, "prod");

      // Auth is enforced on writes.
      const noAuth = await app.request("/api/checkins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ readings: [{ kind: "mood", rating: 3 }] }),
      });
      assertEquals(noAuth.status, 401);

      // Batch create: a snapshot of several readings → one row each, shared recorded_at.
      const created = await app.request("/api/checkins", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          readings: [{ kind: "mood", rating: 4 }, { kind: "energy", rating: 3 }],
          note: "good morning",
        }),
      });
      assertEquals(created.status, 201);
      const { checkins } = await created.json();
      assertEquals(checkins.length, 2);
      assertEquals(
        new Set(checkins.map((c: { kind: string }) => c.kind)),
        new Set(["mood", "energy"]),
      );
      assertEquals(checkins[0].recordedAt, checkins[1].recordedAt, "a check-in shares recorded_at");
      assert(checkins.every((c: { note: string }) => c.note === "good morning"));

      // Empty check-in and out-of-range / unknown kind are rejected.
      for (
        const badBody of [
          { readings: [] },
          { readings: [{ kind: "mood", rating: 9 }] },
          { readings: [{ kind: "vibes", rating: 3 }] },
          { readings: [{ kind: "mood", rating: 1 }, { kind: "mood", rating: 2 }] },
        ]
      ) {
        const r = await app.request("/api/checkins", {
          method: "POST",
          headers: auth,
          body: JSON.stringify(badBody),
        });
        assertEquals(r.status, 400, JSON.stringify(badBody));
      }

      // A second check-in, focus only.
      await app.request("/api/checkins", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ readings: [{ kind: "focus", rating: 5 }] }),
      });

      // List: all live readings, newest first.
      const all = (await (await app.request("/api/checkins", { headers: auth })).json()).checkins;
      assertEquals(all.length, 3);

      // List with a kind filter.
      const moodOnly =
        (await (await app.request("/api/checkins?kind=mood", { headers: auth })).json()).checkins;
      assertEquals(moodOnly.length, 1);
      assertEquals(moodOnly[0].kind, "mood");

      // Bad query params → 400.
      assertEquals((await app.request("/api/checkins?kind=nope", { headers: auth })).status, 400);
      assertEquals((await app.request("/api/checkins?limit=0", { headers: auth })).status, 400);
      assertEquals(
        (await app.request("/api/checkins?from=notadate", { headers: auth })).status,
        400,
      );

      // Immutability: there is no edit or delete route (ADR-017).
      const someId = all[0].id;
      assertEquals(
        (await app.request(`/api/checkins/${someId}`, { method: "PATCH", headers: auth })).status,
        404,
      );
      assertEquals(
        (await app.request(`/api/checkins/${someId}`, { method: "DELETE", headers: auth })).status,
        404,
      );

      // The rows are really persisted (nothing soft-deleted away).
      const [{ count }] = await sql`select count(*)::int from subjective_state`;
      assertEquals(count, 3);
    } finally {
      await sql.end();
    }
  },
});
