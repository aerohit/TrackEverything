import { assertEquals } from "@std/assert";
import { aggregateDay } from "../../src/aggregate.ts";
import type { IngredientRow } from "../../src/products.ts";
import { makeEvent } from "../helpers/events.ts";

function ing(
  itemId: string,
  name: string,
  amount: number | null,
  unit: string | null,
  pos: number,
): IngredientRow {
  return {
    id: crypto.randomUUID(),
    item_id: itemId,
    name,
    amount,
    unit,
    canonical_name: name.toLowerCase(),
    position: pos,
    created_at: new Date(),
  };
}

Deno.test("aggregateDay: caffeine, sleep, workout, subjective, ingredient expansion", () => {
  const itemId = "prod-1";
  const events = [
    makeEvent({
      occurred_at: new Date("2026-06-12T08:00:00Z"),
      category: "drink",
      fields: { caffeine_mg: 120 },
    }),
    makeEvent({
      occurred_at: new Date("2026-06-12T14:00:00Z"),
      category: "drink",
      fields: { caffeine_mg: 90 },
    }),
    makeEvent({
      occurred_at: new Date("2026-06-12T07:00:00Z"),
      category: "sleep",
      fields: { duration_min: 420 },
    }),
    makeEvent({
      occurred_at: new Date("2026-06-12T18:00:00Z"),
      category: "workout",
      fields: { duration_min: 45 },
    }),
    makeEvent({
      occurred_at: new Date("2026-06-12T09:00:00Z"),
      category: "mood",
      fields: { rating: 4 },
    }),
    makeEvent({
      occurred_at: new Date("2026-06-12T15:00:00Z"),
      category: "mood",
      fields: { rating: 2 },
    }),
    makeEvent({
      occurred_at: new Date("2026-06-12T22:00:00Z"),
      category: "supplement",
      item_id: itemId,
      fields: { servings: 2 },
    }),
  ];
  const map = new Map<string, IngredientRow[]>([
    [itemId, [
      ing(itemId, "Magnesium Glycinate", 200, "mg", 0),
      ing(itemId, "L-Theanine", 100, "mg", 1),
    ]],
  ]);

  const s = aggregateDay("2026-06-12", events, map);

  assertEquals(s.eventCount, 7);
  assertEquals(s.byCategory.drink, 2);
  assertEquals(s.caffeineMg, 210);
  assertEquals(s.lastCaffeineAt, "2026-06-12T14:00:00.000Z");
  assertEquals(s.sleepMinutes, 420);
  assertEquals(s.workout, { count: 1, durationMin: 45 });
  assertEquals(s.subjective.mood, { avg: 3, n: 2 });
  const mag = s.ingredients.find((i) => i.canonical_name === "magnesium glycinate");
  const the = s.ingredients.find((i) => i.canonical_name === "l-theanine");
  assertEquals(mag && mag.amount, 400); // 200 * 2 servings
  assertEquals(mag && mag.unit, "mg");
  assertEquals(the && the.amount, 200);
});

Deno.test("aggregateDay: empty day", () => {
  const s = aggregateDay("2026-06-12", [], new Map());
  assertEquals(s.eventCount, 0);
  assertEquals(s.caffeineMg, 0);
  assertEquals(s.lastCaffeineAt, null);
  assertEquals(s.ingredients, []);
  assertEquals(s.subjective, {});
});

Deno.test("aggregateDay: an ingredient with unknown amount stays null", () => {
  const itemId = "p2";
  const events = [
    makeEvent({
      occurred_at: new Date("2026-06-12T10:00:00Z"),
      category: "supplement",
      item_id: itemId,
      fields: {},
    }),
  ];
  const map = new Map<string, IngredientRow[]>([[itemId, [
    ing(itemId, "Proprietary Blend", null, null, 0),
  ]]]);
  const s = aggregateDay("2026-06-12", events, map);
  assertEquals(s.ingredients[0].amount, null);
});
