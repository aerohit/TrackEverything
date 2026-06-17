import { assert, assertEquals } from "@std/assert";
import { connect } from "./client.ts";
import { migrate } from "./migrate.ts";
import {
  createIntakeEvent,
  createItem,
  dailyTotals,
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
        primaryType: "supplement",
        roles: ["drink", "stimulant", "workout_support"],
        defaultServing: {
          displayQuantity: 1,
          displayUnit: "scoop",
          canonicalQuantity: 12,
          canonicalUnit: "g",
        },
        components: [
          { substance: "caffeine", amount: 200, unit: "mg" },
          { substance: "creatine", amount: 5, unit: "g" },
          { substance: "sodium", amount: 300, unit: "mg" },
        ],
      });

      // A recipe (smoothie) built from child items.
      const whey = await createItem(db, {
        name: "Whey protein",
        kind: "product",
        primaryType: "supplement",
        roles: [],
        defaultServing: {
          displayQuantity: 30,
          displayUnit: "g",
          canonicalQuantity: 30,
          canonicalUnit: "g",
        },
        components: [{ substance: "protein", amount: 24, unit: "g" }],
      });
      const smoothie = await createItem(db, {
        name: "Morning smoothie",
        kind: "recipe",
        primaryType: "meal",
        roles: ["drink", "food"],
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
        confidence: "high",
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
        resolved: [{ substance: "caffeine", amount: 120, unit: "mg" }],
      });

      // The pre-workout event's snapshot is frozen + complete.
      const events = await listIntakeEvents(db, { from: day, to: nextDay });
      assertEquals(events.length, 3);
      assertEquals(events[0].displayName, "Pre-workout"); // newest first (16:00)
      const preResolved = new Map(events[0].resolved.map((r) => [r.substance, r.amount]));
      assertEquals([
        preResolved.get("caffeine"),
        preResolved.get("creatine"),
        preResolved.get("sodium"),
      ], [200, 5, 300]);
      assertEquals(events[0].canonicalQuantity, 12); // 1 scoop = 12 g

      // Daily totals sum across events (caffeine: 200 pre + 120 coffee = 320; protein 24 from smoothie).
      let totals = totalsMap(await dailyTotals(db, day, nextDay));
      assertEquals(totals.get("caffeine"), 320);
      assertEquals(totals.get("creatine"), 5);
      assertEquals(totals.get("protein"), 24);

      // Edit the pre-workout to 2 scoops → snapshot re-resolves (caffeine doubles).
      assert(await updateIntakeEvent(db, preEvent, { quantity: 2, unit: "scoop" }));
      totals = totalsMap(await dailyTotals(db, day, nextDay));
      assertEquals(totals.get("caffeine"), 520); // 400 pre + 120 coffee
      assertEquals(totals.get("creatine"), 10);

      // Soft-delete the coffee → it drops out of totals, but the row remains.
      const coffee = (await listIntakeEvents(db, { from: day, to: nextDay })).find((e) =>
        e.displayName === "Coffee"
      );
      assert(coffee && await softDeleteIntakeEvent(db, coffee.id));
      totals = totalsMap(await dailyTotals(db, day, nextDay));
      assertEquals(totals.get("caffeine"), 400); // coffee's 120 gone
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
        primaryType: "supplement",
        defaultServing: { displayQuantity: 2, displayUnit: "scoops" },
        components: [
          { substance: "sodium", amount: 1034, unit: "mg" },
          { substance: "potassium", amount: 306, unit: "mg" },
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
        assertEquals(e.resolved.find((r) => r.substance === "sodium")?.amount, 517);
        assertEquals(e.resolved.find((r) => r.substance === "potassium")?.amount, 153);
      }

      // Two half-servings sum to one full serving in the daily totals.
      const totals = totalsMap(await dailyTotals(db, from, to));
      assertEquals(totals.get("sodium"), 1034);
      assertEquals(totals.get("potassium"), 306);
    } finally {
      await sql.end();
    }
  },
});
