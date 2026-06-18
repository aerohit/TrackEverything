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
      assert(subs.length >= 20 && subs.some((s: { name: string }) => s.name === "Caffeine"));

      // Create a product; the response carries its resolved components.
      const created = await app.request("/api/items", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          name: "My Pre-workout",
          kind: "product",
          defaultServing: {
            displayQuantity: 1,
            displayUnit: "scoop",
            canonicalQuantity: 12,
            canonicalUnit: "g",
          },
          components: [{ substance: "Caffeine", amount: 200, unit: "mg" }, {
            substance: "Creatine",
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
        }),
      });
      assertEquals(logged.status, 201);
      const ev = await logged.json();
      assertEquals(byName(ev.resolved).get("Caffeine"), 200);

      // Freeform coffee with a manual caffeine amount (no item).
      await app.request("/api/intake", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          displayName: "Coffee",
          quantity: 1,
          unit: "cup",
          occurredAt: "2026-06-15T07:00:00.000Z",
          resolved: [{ substance: "Caffeine", amount: 120, unit: "mg" }],
        }),
      });

      // List + daily totals.
      assertEquals(
        (await (await app.request(`/api/intake?${DAY}`, { headers: auth })).json()).events.length,
        2,
      );
      const totals =
        (await (await app.request(`/api/intake/totals?${DAY}`, { headers: auth })).json()).totals;
      assertEquals(byName(totals).get("Caffeine"), 320); // 200 pre + 120 coffee

      // totals requires the window.
      assertEquals((await app.request("/api/intake/totals", { headers: auth })).status, 400);

      // Edit → 2 scoops, re-resolves.
      const patched = await app.request(`/api/intake/${ev.id}`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ quantity: 2, unit: "scoop" }),
      });
      assertEquals(patched.status, 200);
      assertEquals(byName((await patched.json()).resolved).get("Caffeine"), 400);

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
      assertEquals(byName(after).get("Caffeine"), 120); // only the coffee remains
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
            draft: {
              name: "banana",
              kind: "simple" as const,
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
          body: JSON.stringify({ name, kind: "product" }),
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

Deno.test({
  name: "inputs API: Quick Capture — pin an item, list quick-items with presets, unpin",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL);
    const { sql, db } = connect(DATABASE_URL);
    try {
      const app = createApp(db, { token: TOKEN });

      // Create an item to pin.
      const created = await (await app.request("/api/items", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          name: "Water",
          kind: "simple",
          defaultServing: { displayQuantity: 500, displayUnit: "ml" },
        }),
      })).json();
      const id = created.id as string;

      // Initially no favorites.
      assertEquals(
        (await (await app.request("/api/intake/quick-items", { headers: auth })).json()).items,
        [],
      );

      // Bad id → 404; bad body → 400.
      assertEquals(
        (await app.request("/api/items/not-a-uuid/quick-log", {
          method: "PATCH",
          headers: auth,
          body: "{}",
        })).status,
        404,
      );
      assertEquals(
        (await app.request(`/api/items/${id}/quick-log`, {
          method: "PATCH",
          headers: auth,
          body: "{}",
        })).status,
        400,
      );

      // Pin it with two amount presets.
      const pinned = await (await app.request(`/api/items/${id}/quick-log`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({
          quickLog: true,
          quickOrder: 0,
          presets: [
            { label: "250 ml", quantity: 250, unit: "ml" },
            { label: "1 L", quantity: 1000, unit: "ml" },
          ],
        }),
      })).json();
      assertEquals(pinned.quickLog, true);
      assertEquals(pinned.quickPresets.length, 2);

      // quick-items now lists it with its presets (ordered).
      const quick =
        (await (await app.request("/api/intake/quick-items", { headers: auth })).json()).items;
      assertEquals(quick.length, 1);
      assertEquals(quick[0].name, "Water");
      assertEquals(quick[0].quickPresets.map((p: { quantity: number }) => p.quantity), [250, 1000]);

      // Unpin → presets cleared and it drops off the quick list.
      await app.request(`/api/items/${id}/quick-log`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ quickLog: false }),
      });
      const detail = await (await app.request(`/api/items/${id}`, { headers: auth })).json();
      assertEquals(detail.quickLog, false);
      assertEquals(detail.quickPresets, []);
      assertEquals(
        (await (await app.request("/api/intake/quick-items", { headers: auth })).json()).items,
        [],
      );
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "inputs API: capture provenance (source) + favorite suggestions (v2-C0)",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL);
    const { sql, db } = connect(DATABASE_URL);
    try {
      const app = createApp(db, { token: TOKEN });

      // An item we'll log a few times.
      const item = await (await app.request("/api/items", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ name: "Espresso", kind: "simple" }),
      })).json();

      // A quick-source log carries its provenance back on read.
      const ev = await (await app.request("/api/intake", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          displayName: "Espresso",
          itemId: item.id,
          quantity: 1,
          unit: "cup",
          source: "quick",
        }),
      })).json();
      assertEquals(ev.source, "quick");

      // A log with no source defaults to "manual".
      const ev2 = await (await app.request("/api/intake", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          displayName: "Espresso",
          itemId: item.id,
          quantity: 1,
          unit: "cup",
        }),
      })).json();
      assertEquals(ev2.source, "manual");

      // Not yet suggested (only 2 logs < the default threshold of 3).
      const before =
        (await (await app.request("/api/intake/favorite-suggestions", { headers: auth })).json())
          .items;
      assertEquals(before.find((i: { id: string }) => i.id === item.id), undefined);

      // Third log crosses the threshold → it shows up as a suggestion with its count.
      await app.request("/api/intake", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          displayName: "Espresso",
          itemId: item.id,
          quantity: 1,
          unit: "cup",
          source: "recent",
        }),
      });
      const sugg =
        (await (await app.request("/api/intake/favorite-suggestions", { headers: auth })).json())
          .items;
      const me = sugg.find((i: { id: string }) => i.id === item.id);
      assert(me, "Espresso should be suggested after 3 logs");
      assertEquals(me.count, 3);

      // Once pinned, it drops out of suggestions.
      await app.request(`/api/items/${item.id}/quick-log`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ quickLog: true }),
      });
      const after =
        (await (await app.request("/api/intake/favorite-suggestions", { headers: auth })).json())
          .items;
      assertEquals(after.find((i: { id: string }) => i.id === item.id), undefined);
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "inputs API: a pinned stack (recipe of items) returns its members in quick-items (v2-C2)",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL);
    const { sql, db } = connect(DATABASE_URL);
    try {
      const app = createApp(db, { token: TOKEN });
      const mk = async (name: string) =>
        (await (await app.request("/api/items", {
          method: "POST",
          headers: auth,
          body: JSON.stringify({
            name,
            kind: "simple",
            defaultServing: { displayQuantity: 1, displayUnit: "tablet" },
          }),
        })).json()).id as string;

      const vd = await mk("Vitamin D");
      const mg = await mk("Magnesium");

      // A "Morning Stack" — a stack-kind item whose components are those items.
      const stack = await (await app.request("/api/items", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          name: "Morning Stack",
          kind: "stack",
          components: [
            { childItemId: vd, amount: 1, unit: "tablet" },
            { childItemId: mg, amount: 2, unit: "capsule" },
          ],
        }),
      })).json();

      await app.request(`/api/items/${stack.id}/quick-log`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ quickLog: true, quickOrder: 0 }),
      });

      const quick =
        (await (await app.request("/api/intake/quick-items", { headers: auth })).json()).items;
      const me = quick.find((i: { id: string }) => i.id === stack.id);
      assert(me, "the pinned stack should appear in quick-items");
      assertEquals(me.stack.map((m: { name: string }) => m.name), ["Vitamin D", "Magnesium"]);
      assertEquals(
        me.stack.map((m: { quantity: number; unit: string }) => `${m.quantity}${m.unit}`),
        ["1tablet", "2capsule"],
      );

      // Logging the stack as a single entry returns its member items on read (ADR-030),
      // so the overview can list them.
      await app.request("/api/intake", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          displayName: "Morning Stack",
          itemId: stack.id,
          quantity: 1,
          unit: "serving",
          source: "quick",
        }),
      });
      const events = (await (await app.request("/api/intake", { headers: auth })).json()).events;
      const ev = events.find((e: { itemId: string }) => e.itemId === stack.id);
      assert(ev, "the stack event should be listed");
      assertEquals(ev.stackItems.map((m: { name: string }) => m.name), ["Vitamin D", "Magnesium"]);
      // A non-stack event has no stackItems.
      const plain = events.find((e: { itemId: string }) => e.itemId === vd);
      if (plain) assertEquals(plain.stackItems, []);
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "inputs API: soft-delete an item — it leaves the catalog but past logs still display",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL);
    const { sql, db } = connect(DATABASE_URL);
    try {
      const app = createApp(db, { token: TOKEN });

      const item = await (await app.request("/api/items", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          name: "Old Protein Bar",
          kind: "product",
          defaultServing: { displayQuantity: 1, displayUnit: "bar" },
          components: [{ substance: "protein", amount: 20, unit: "g" }],
        }),
      })).json();

      // Log it (frozen snapshot lives on the event).
      const when = "2026-06-18T09:00:00.000Z";
      await app.request("/api/intake", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          displayName: "Old Protein Bar",
          itemId: item.id,
          quantity: 1,
          unit: "bar",
          occurredAt: when,
        }),
      });

      // Soft-delete; a second delete is 404; an unknown id is 404.
      assertEquals(
        (await app.request(`/api/items/${item.id}`, { method: "DELETE", headers: auth })).status,
        204,
      );
      assertEquals(
        (await app.request(`/api/items/${item.id}`, { method: "DELETE", headers: auth })).status,
        404,
      );

      // Gone from the catalog, search, and item detail.
      const list = (await (await app.request("/api/items", { headers: auth })).json()).items;
      assertEquals(list.find((i: { id: string }) => i.id === item.id), undefined);
      assertEquals(
        (await (await app.request("/api/items?search=Old%20Protein", { headers: auth })).json())
          .items.length,
        0,
      );
      assertEquals((await app.request(`/api/items/${item.id}`, { headers: auth })).status, 404);

      // But the past log still displays with its name + frozen resolution + totals.
      const day = "from=2026-06-18T00:00:00Z&to=2026-06-19T00:00:00Z";
      const events =
        (await (await app.request(`/api/intake?${day}`, { headers: auth })).json()).events;
      const ev = events.find((e: { itemId: string }) => e.itemId === item.id);
      assert(ev, "the past log should still be listed");
      assertEquals(ev.displayName, "Old Protein Bar");
      assertEquals(
        ev.resolved.find((r: { substance: string }) => r.substance === "Protein")?.amount,
        20,
      );
      const totals =
        (await (await app.request(`/api/intake/totals?${day}`, { headers: auth })).json()).totals;
      assertEquals(
        totals.find((t: { substance: string }) => t.substance === "Protein")?.amount,
        20,
      );
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "inputs API: precision defaults from source — photo/voice rough, else precise (v2-C4)",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL);
    const { sql, db } = connect(DATABASE_URL);
    try {
      const app = createApp(db, { token: TOKEN });
      const log = async (body: Record<string, unknown>) =>
        await (await app.request("/api/intake", {
          method: "POST",
          headers: auth,
          body: JSON.stringify(body),
        })).json();

      const photo = await log({
        displayName: "Salad photo",
        quantity: 1,
        unit: "plate",
        source: "photo",
        resolved: [{ substance: "protein", amount: 30, unit: "g" }],
      });
      assertEquals(photo.source, "photo");
      assertEquals(photo.precision, "rough"); // photo → rough by default

      const quick = await log({ displayName: "Water", quantity: 1, unit: "cup", source: "quick" });
      assertEquals(quick.precision, "precise");

      const bare = await log({ displayName: "Note", quantity: 1, unit: "cup" });
      assertEquals(bare.precision, "precise"); // default

      const forced = await log({
        displayName: "Manual rough",
        quantity: 1,
        unit: "bowl",
        precision: "rough",
      });
      assertEquals(forced.precision, "rough"); // explicit wins
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "inputs API: occasional item logged by name is flagged unresolved (v2, R-CAP-30)",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL);
    const { sql, db } = connect(DATABASE_URL);
    try {
      const app = createApp(db, { token: TOKEN });
      const day = "from=2026-06-10T00:00:00Z&to=2026-06-11T00:00:00Z";

      // Freeform "occasional item" with no matching item → unresolved, no nutrition.
      const occ = await (await app.request("/api/intake", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          displayName: "restaurant pad thai",
          quantity: 1,
          unit: "plate",
          occurredAt: "2026-06-10T13:00:00Z",
          source: "manual",
          unresolved: true,
        }),
      })).json();
      assertEquals(occ.unresolved, true);
      assertEquals(occ.resolved.length, 0);

      // A normal item log defaults to resolved (unresolved=false).
      const item = await (await app.request("/api/items", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          name: "Coffee",
          kind: "simple",
          components: [{ substance: "Caffeine", amount: 95, unit: "mg" }],
        }),
      })).json();
      const normal = await (await app.request("/api/intake", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          displayName: "Coffee",
          itemId: item.id,
          quantity: 1,
          unit: "serving",
          occurredAt: "2026-06-10T08:00:00Z",
        }),
      })).json();
      assertEquals(normal.unresolved, false);

      // The unresolved entry contributes nothing to totals (only the coffee's caffeine).
      const totals =
        (await (await app.request(`/api/intake/totals?${day}`, { headers: auth })).json()).totals;
      assertEquals(totals.length, 1);
      assertEquals(totals[0].substance, "Caffeine");
      assertEquals(totals[0].amount, 95);

      // It's listed and carries the flag for the Overview.
      const events =
        (await (await app.request(`/api/intake?${day}`, { headers: auth })).json()).events;
      assert(
        events.find((e: { displayName: string; unresolved: boolean }) =>
          e.displayName === "restaurant pad thai" && e.unresolved
        ),
      );
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "inputs API: resolving an unresolved event clears the flag + re-resolves (R-CAP-31)",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL);
    const { sql, db } = connect(DATABASE_URL);
    try {
      const app = createApp(db, { token: TOKEN });
      const post = async (p: string, b: unknown) =>
        await (await app.request(p, { method: "POST", headers: auth, body: JSON.stringify(b) }))
          .json();
      const patch = async (id: string, b: unknown) =>
        await (await app.request(`/api/intake/${id}`, {
          method: "PATCH",
          headers: auth,
          body: JSON.stringify(b),
        })).json();

      // (a) link to an existing item.
      const item = await post("/api/items", {
        name: "Latte",
        kind: "simple",
        components: [{ substance: "Caffeine", amount: 80, unit: "mg" }],
      });
      const u1 = await post("/api/intake", {
        displayName: "cafe latte",
        quantity: 1,
        unit: "cup",
        occurredAt: "2026-06-09T08:00:00Z",
        source: "manual",
        unresolved: true,
      });
      assertEquals(u1.unresolved, true);
      const r1 = await patch(u1.id, {
        itemId: item.id,
        displayName: "Latte",
        quantity: 1,
        unit: "serving",
        unresolved: false,
      });
      assertEquals(r1.unresolved, false);
      assertEquals(
        r1.resolved.find((x: { substance: string }) => x.substance === "Caffeine")?.amount,
        80,
      );

      // (c) enter nutrients ad-hoc (no item).
      const u2 = await post("/api/intake", {
        displayName: "office cake",
        quantity: 1,
        unit: "slice",
        occurredAt: "2026-06-09T15:00:00Z",
        source: "manual",
        unresolved: true,
      });
      const r2 = await patch(u2.id, {
        resolved: [{ substance: "Sugar", amount: 25, unit: "g" }],
        unresolved: false,
      });
      assertEquals(r2.unresolved, false);
      assertEquals(r2.resolved[0].substance, "Sugar");
      assertEquals(r2.itemId, null); // no item stored for the ad-hoc path

      // Totals now reflect both resolved entries (day 2026-06-09).
      const day = "from=2026-06-09T00:00:00Z&to=2026-06-10T00:00:00Z";
      const totals =
        (await (await app.request(`/api/intake/totals?${day}`, { headers: auth })).json()).totals;
      assertEquals(byName(totals).get("Caffeine"), 80);
      assertEquals(byName(totals).get("Sugar"), 25);
    } finally {
      await sql.end();
    }
  },
});
