import { assert, assertEquals } from "@std/assert";
import { connect } from "./client.ts";
import { migrate } from "./migrate.ts";
import {
  createIntakeEvent,
  createItem,
  dailyTotals,
  getItemDetail,
  listIntakeEvents,
  softDeleteIntakeEvent,
  updateIntakeEvent,
} from "./inputs.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

function totalsMap(t: { substance: string; amount: number }[]) {
  return new Map(t.map((x) => [x.substance, x.amount]));
}

Deno.test({
  // Needs a real Postgres; auto-skips locally without DATABASE_URL (runs in CI).
  name: "inputs: items, recipe resolution, logging, daily totals, edit, soft-delete",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL);
    const { sql, db } = connect(DATABASE_URL);
    try {
      await sql`truncate resolved_amount, intake_event, item_component, input_item cascade`;
      const day = new Date("2026-06-15T00:00:00.000Z");
      const nextDay = new Date("2026-06-16T00:00:00.000Z");
      const at = (h: number) =>
        new Date(`2026-06-15T${String(h).padStart(2, "0")}:00:00.000Z`).toISOString();

      // A product (pre-workout) with actives per scoop.
      const pre = await createItem(db, {
        name: "My Pre-workout",
        kind: "product",
        defaultServing: {
          displayQuantity: 1,
          displayUnit: "scoop",
          canonicalQuantity: 12,
          canonicalUnit: "g",
        },
        components: [
          { substance: "Caffeine", amount: 200, unit: "mg" },
          { substance: "Creatine", amount: 5, unit: "g" },
          { substance: "Sodium", amount: 300, unit: "mg" },
        ],
      });

      // A recipe (smoothie) built from child items.
      const whey = await createItem(db, {
        name: "Whey protein",
        kind: "product",
        defaultServing: {
          displayQuantity: 30,
          displayUnit: "g",
          canonicalQuantity: 30,
          canonicalUnit: "g",
        },
        components: [{ substance: "Protein", amount: 24, unit: "g" }],
      });
      const smoothie = await createItem(db, {
        name: "Morning smoothie",
        kind: "recipe",
        defaultServing: { displayQuantity: 1, displayUnit: "glass" },
        components: [{ childItemId: whey, amount: 30, unit: "g" }],
      });

      // Log 1 scoop pre-workout at 16:00.
      const preEvent = await createIntakeEvent(db, {
        displayName: "Pre-workout",
        itemId: pre,
        quantity: 1,
        unit: "scoop",
        occurredAt: at(16),
        contextTags: ["pre_workout"],
      });
      // Log 1 smoothie at 08:00 (resolves through the child item).
      await createIntakeEvent(db, {
        displayName: "Smoothie",
        itemId: smoothie,
        quantity: 1,
        unit: "glass",
        occurredAt: at(8),
      });
      // A freeform coffee with a manual caffeine amount (no item).
      await createIntakeEvent(db, {
        displayName: "Coffee",
        quantity: 1,
        unit: "cup",
        occurredAt: at(7),
        resolved: [{ substance: "Caffeine", amount: 120, unit: "mg" }],
      });

      // The pre-workout event's snapshot is frozen + complete.
      const events = await listIntakeEvents(db, { from: day, to: nextDay });
      assertEquals(events.length, 3);
      assertEquals(events[0].displayName, "Pre-workout"); // newest first (16:00)
      const preResolved = new Map(events[0].resolved.map((r) => [r.substance, r.amount]));
      assertEquals([
        preResolved.get("Caffeine"),
        preResolved.get("Creatine"),
        preResolved.get("Sodium"),
      ], [200, 5, 300]);

      // Daily totals sum across events (caffeine: 200 pre + 120 coffee = 320; protein 24 from smoothie).
      let totals = totalsMap(await dailyTotals(db, day, nextDay));
      assertEquals(totals.get("Caffeine"), 320);
      assertEquals(totals.get("Creatine"), 5);
      assertEquals(totals.get("Protein"), 24);

      // Edit the pre-workout to 2 scoops → snapshot re-resolves (caffeine doubles).
      assert(await updateIntakeEvent(db, preEvent, { quantity: 2, unit: "scoop" }));
      totals = totalsMap(await dailyTotals(db, day, nextDay));
      assertEquals(totals.get("Caffeine"), 520); // 400 pre + 120 coffee
      assertEquals(totals.get("Creatine"), 10);

      // Soft-delete the coffee → it drops out of totals, but the row remains.
      const coffee = (await listIntakeEvents(db, { from: day, to: nextDay })).find((e) =>
        e.displayName === "Coffee"
      );
      assert(coffee && await softDeleteIntakeEvent(db, coffee.id));
      totals = totalsMap(await dailyTotals(db, day, nextDay));
      assertEquals(totals.get("Caffeine"), 400); // coffee's 120 gone
      assertEquals((await listIntakeEvents(db, { from: day, to: nextDay })).length, 2);
      const [{ count }] = await sql`select count(*)::int from intake_event`;
      assertEquals(count, 3); // soft delete, not hard
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  name: "inputs: partial servings contribute proportionally to daily totals",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL);
    const { sql, db } = connect(DATABASE_URL);
    try {
      await sql`truncate resolved_amount, intake_event, item_component, input_item cascade`;
      const from = new Date("2026-06-20T00:00:00.000Z");
      const to = new Date("2026-06-21T00:00:00.000Z");

      // Production shape: serving = 2 scoops; sodium 1034 mg + potassium 306 mg per serving.
      const id = await createItem(db, {
        name: "Bulk Electrolyte Powder",
        kind: "product",
        defaultServing: { displayQuantity: 2, displayUnit: "scoops" },
        components: [
          { substance: "Sodium", amount: 1034, unit: "mg" },
          { substance: "Potassium", amount: 306, unit: "mg" },
        ],
      });

      // Log half a serving two equivalent ways: "0.5 serving" and "1 scoop" (singular).
      await createIntakeEvent(db, {
        displayName: "Bulk Electrolyte Powder",
        itemId: id,
        quantity: 0.5,
        unit: "serving",
        occurredAt: "2026-06-20T08:00:00.000Z",
      });
      await createIntakeEvent(db, {
        displayName: "Bulk Electrolyte Powder",
        itemId: id,
        quantity: 1,
        unit: "scoop",
        occurredAt: "2026-06-20T18:00:00.000Z",
      });

      // Each event froze a half-serving snapshot (sodium 517).
      const events = await listIntakeEvents(db, { from, to });
      assertEquals(events.length, 2);
      for (const e of events) {
        assertEquals(e.resolved.find((r) => r.substance === "Sodium")?.amount, 517);
        assertEquals(e.resolved.find((r) => r.substance === "Potassium")?.amount, 153);
      }

      // Two half-servings sum to one full serving in the daily totals.
      const totals = totalsMap(await dailyTotals(db, from, to));
      assertEquals(totals.get("Sodium"), 1034);
      assertEquals(totals.get("Potassium"), 306);
    } finally {
      await sql.end();
    }
  },
});

Deno.test({
  // Finding a substance in an item's components must match the substance's primary
  // name AND any of its aliases, case-insensitively, and always resolve to the one
  // canonical substance (its `name`) — never create a duplicate keyed by the alias.
  name:
    "inputs: substance match is case-insensitive over name + aliases, resolves to canonical name",
  ignore: !DATABASE_URL,
  async fn() {
    await migrate(DATABASE_URL!);
    const { sql, db } = connect(DATABASE_URL!);
    try {
      await sql`truncate resolved_amount, intake_event, item_component, input_item cascade`;
      // A canonical substance with a couple of aliases (differing case / separators).
      await sql`delete from substance where name = 'zz_match_test'`;
      await sql`insert into substance (name, substance_type, canonical_unit, aliases)
        values ('zz_match_test', 'other', 'mg', array['ZZ-Alias-One', 'zz alias two'])`;
      const before = (await sql<{ n: number }[]>`select count(*)::int as n from substance`)[0].n;

      // Reference it three ways: canonical name (upper), alias 1 (upper+hyphen), alias 2 (spaces).
      const id = await createItem(db, {
        name: "Alias Match Probe",
        kind: "product",
        components: [
          { substance: "ZZ_MATCH_TEST", amount: 1, unit: "mg" },
          { substance: "zz-alias-ONE", amount: 2, unit: "mg" },
          { substance: "ZZ Alias Two", amount: 3, unit: "mg" },
        ],
      });

      const detail = await getItemDetail(db, id);
      // All three resolved to the SAME canonical substance, reported by its `name`.
      assertEquals(detail!.components.map((c) => c.substance), [
        "zz_match_test",
        "zz_match_test",
        "zz_match_test",
      ]);
      // No alias-keyed duplicate substance was auto-created.
      const after = (await sql<{ n: number }[]>`select count(*)::int as n from substance`)[0].n;
      assertEquals(after, before);

      await sql`truncate resolved_amount, intake_event, item_component, input_item cascade`;
      await sql`delete from substance where name = 'zz_match_test'`;
    } finally {
      await sql.end();
    }
  },
});
