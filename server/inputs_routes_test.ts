import { assert, assertEquals } from "@std/assert";
import { connect } from "../db/client.ts";
import type { Db } from "../db/client.ts";
import { migrate } from "../db/migrate.ts";
import { createApp } from "./app.ts";
import type { ProductLookup } from "./barcode.ts";

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

      // An unknown substance is auto-created (ADR-019), not rejected.
      const novel = await app.request("/api/items", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          name: "Greens powder",
          kind: "simple",
          primaryType: "supplement",
          components: [{ substance: "Spirulina", amount: 1, unit: "g" }],
        }),
      });
      assertEquals(novel.status, 201);
      const subNames = (await (await app.request("/api/substances", { headers: auth })).json())
        .substances
        .map((s: { name: string }) => s.name);
      assert(subNames.includes("spirulina")); // normalized + auto-created

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

Deno.test({
  name: "inputs API: label scan returns a draft; 503 when scanning is unconfigured",
  ignore: !DATABASE_URL,
  async fn() {
    const { sql, db } = connect(DATABASE_URL);
    try {
      // No scanner configured → 503.
      const noScan = createApp(db, { token: TOKEN });
      assertEquals(
        (await noScan.request("/api/items/scan", {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ imageBase64: "abc", mediaType: "image/png" }),
        })).status,
        503,
      );

      // With a (mock) scanner → returns the draft.
      const scanner = {
        // deno-lint-ignore require-await
        scan: async () => ({
          name: "Scanned Multi",
          kind: "product" as const,
          primaryType: "supplement" as const,
          roles: [],
          defaultServing: { displayQuantity: 1, displayUnit: "tablet" },
          components: [{ substance: "niacin", amount: 16, unit: "mg" }],
        }),
      };
      const app = createApp(db, { token: TOKEN, scanner });

      // Bad image payload → 400.
      assertEquals(
        (await app.request("/api/items/scan", { method: "POST", headers: auth, body: "{}" }))
          .status,
        400,
      );

      const res = await app.request("/api/items/scan", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ imageBase64: "abc", mediaType: "image/png" }),
      });
      assertEquals(res.status, 200);
      const draft = await res.json();
      assertEquals(draft.name, "Scanned Multi");
      assertEquals(draft.components[0].substance, "niacin");
    } finally {
      await sql.end();
    }
  },
});

// The barcode route never touches the DB, so it runs without a Postgres.
Deno.test("inputs API: barcode lookup returns a draft, 404 when unknown, 503 when unconfigured", async () => {
  const noDb = null as unknown as Db;

  // No lookup configured → 503.
  const bare = createApp(noDb, { token: TOKEN });
  assertEquals(
    (await bare.request("/api/items/barcode", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ barcode: "0123456789012" }),
    })).status,
    503,
  );

  const lookup: ProductLookup = {
    // deno-lint-ignore require-await
    lookup: async (barcode: string) =>
      barcode === "0123456789012"
        ? {
          name: "Greek Yogurt",
          kind: "product" as const,
          primaryType: "food" as const,
          roles: [],
          defaultServing: { displayQuantity: 1, displayUnit: "serving" },
          components: [{ substance: "protein", amount: 17, unit: "g" }],
        }
        : null,
  };
  const app = createApp(noDb, { token: TOKEN, lookup });

  // Non-digit / wrong-length barcode → 400.
  assertEquals(
    (await app.request("/api/items/barcode", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ barcode: "nope" }),
    })).status,
    400,
  );

  // Unknown barcode (lookup → null) → 404.
  assertEquals(
    (await app.request("/api/items/barcode", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ barcode: "9999999999999" }),
    })).status,
    404,
  );

  // A missing token is rejected before the route runs.
  assertEquals(
    (await app.request("/api/items/barcode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ barcode: "0123456789012" }),
    })).status,
    401,
  );

  const res = await app.request("/api/items/barcode", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ barcode: "0123456789012" }),
  });
  assertEquals(res.status, 200);
  const draft = await res.json();
  assertEquals(draft.name, "Greek Yogurt");
  assertEquals(draft.components[0].substance, "protein");
});

Deno.test({
  name: "inputs API: recognize (+match) and recent items",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL);
    const { sql, db } = connect(DATABASE_URL);
    try {
      await sql`truncate resolved_amount, intake_event, item_component, input_item cascade`;

      // Recognition defaults to 503 when unconfigured.
      const bare = createApp(db, { token: TOKEN });
      assertEquals(
        (await bare.request("/api/intake/recognize", {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ source: "text", text: "a banana" }),
        })).status,
        503,
      );

      // A seed item so the recognizer's match has something to find.
      await bare.request("/api/items", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          name: "Banana",
          kind: "simple",
          primaryType: "food",
          components: [{ substance: "calories", amount: 105, unit: "kcal" }],
        }),
      });

      // Mock the recognizer (voice is transcribed on-device; it arrives here as text).
      const recognizer = {
        recognize: () =>
          Promise.resolve({
            name: "banana",
            quantity: 1,
            unit: "piece",
            primaryType: "food" as const,
            draft: {
              name: "banana",
              kind: "simple" as const,
              primaryType: "food" as const,
              roles: [],
              defaultServing: { displayQuantity: 1, displayUnit: "piece" },
              components: [{ substance: "calories", amount: 105, unit: "kcal" }],
            },
          }),
      };
      const app = createApp(db, { token: TOKEN, recognizer });

      // Recognition returns the draft + a catalog match ("Banana").
      const rec = await app.request("/api/intake/recognize", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ source: "text", text: "one banana" }),
      });
      assertEquals(rec.status, 200);
      const body = await rec.json();
      assertEquals(body.recognized.name, "banana");
      assertEquals(body.matches.length, 1);
      assertEquals(body.matches[0].name, "Banana");

      // Bad recognize payload → 400.
      assertEquals(
        (await app.request("/api/intake/recognize", {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ source: "photo" }),
        })).status,
        400,
      );

      // Recent items: distinct, newest first. Log two banana intakes + one coffee.
      const itemId =
        (await (await app.request("/api/items?search=Banana", { headers: auth })).json()).items[0]
          .id;
      await app.request("/api/intake", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          displayName: "Banana",
          itemId,
          quantity: 1,
          unit: "piece",
          occurredAt: "2026-06-15T08:00:00.000Z",
        }),
      });
      await app.request("/api/intake", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          displayName: "Coffee",
          quantity: 1,
          unit: "cup",
          occurredAt: "2026-06-15T09:00:00.000Z",
        }),
      });
      await app.request("/api/intake", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          displayName: "Banana",
          itemId,
          quantity: 2,
          unit: "piece",
          occurredAt: "2026-06-15T10:00:00.000Z",
        }),
      });

      const recent = await app.request("/api/intake/recent-items?limit=10", { headers: auth });
      assertEquals(recent.status, 200);
      const items = (await recent.json()).items;
      assertEquals(items.length, 2); // banana deduped to one entry
      assertEquals(items[0].displayName, "Banana"); // newest first
      assertEquals(items[0].quantity, 2); // carries the most recent log's qty
      assertEquals(items[1].displayName, "Coffee");
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "inputs API: item search is fuzzy (pg_trgm) — tolerates punctuation/word order",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL);
    const { sql, db } = connect(DATABASE_URL);
    const app = createApp(db, { token: TOKEN });
    try {
      await sql`truncate resolved_amount, intake_event, item_component, input_item cascade`;
      for (const name of ["Dope-Max Pre-Workout", "Magnesium Glycinate", "Greek Yogurt"]) {
        await app.request("/api/items", {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ name, kind: "product", primaryType: "supplement" }),
        });
      }

      const search = async (q: string) =>
        (await (await app.request("/api/items?search=" + encodeURIComponent(q), { headers: auth }))
          .json()).items as { name: string }[];

      // The reported case: a multi-word, un-hyphenated query finds the hyphenated item.
      assertEquals((await search("pre workout"))[0]?.name, "Dope-Max Pre-Workout");
      // And the longer phrase, single words, and a misspelling.
      assertEquals((await search("dope max pre workout"))[0]?.name, "Dope-Max Pre-Workout");
      assert((await search("pre")).some((i) => i.name === "Dope-Max Pre-Workout"));
      assert((await search("workout")).some((i) => i.name === "Dope-Max Pre-Workout"));
      assert((await search("magnesium")).some((i) => i.name === "Magnesium Glycinate"));
      assert((await search("yoghurt")).some((i) => i.name === "Greek Yogurt")); // minor misspelling

      // An unrelated query does not match.
      assertEquals((await search("zzzquil tablets")).length, 0);
    } finally {
      await sql.end();
    }
  },
});
