import { assert, assertEquals } from "@std/assert";
import { convert, type ResolveGraph, type ResolveItem, resolveItem } from "./resolve.ts";
import type { SubstanceUnit } from "../shared/inputs.ts";

Deno.test("convert: normalizes within a dimension, rejects across", () => {
  assertEquals(convert(1, "g", "mg"), 1000);
  assertEquals(convert(500, "mg", "g"), 0.5);
  assertEquals(convert(1, "l", "ml"), 1000);
  assertEquals(convert(2, "scoop", "scoop"), 2); // same unit passes through
  assertEquals(convert(1, "g", "ml"), null); // mass↔volume not convertible
  assertEquals(convert(1, "scoop", "g"), null); // unknown unit
});

function graph(
  items: ResolveItem[],
  substances: Record<string, SubstanceUnit>,
): ResolveGraph {
  return {
    items: new Map(items.map((i) => [i.id, i])),
    substanceUnit: new Map(Object.entries(substances)),
  };
}

Deno.test("resolveItem: product scales actives by servings", () => {
  // Pre-workout: 1 scoop = 12 g; 200 mg caffeine + 5 g creatine per serving.
  const g = graph([{
    id: "pre",
    defaultDisplayQuantity: 1,
    defaultDisplayUnit: "scoop",
    defaultCanonicalQuantity: 12,
    defaultCanonicalUnit: "g",
    components: [
      { substanceId: "caffeine", childItemId: null, amount: 200, unit: "mg" },
      { substanceId: "creatine", childItemId: null, amount: 5, unit: "g" },
    ],
  }], { caffeine: "mg", creatine: "g" });

  const one = resolveItem("pre", 1, "scoop", g);
  assert(one.complete);
  assertEquals(
    new Map(one.amounts.map((a) => [a.substanceId, a.amount])),
    new Map([["caffeine", 200], ["creatine", 5]]),
  );

  // 2 scoops doubles; logging by canonical grams works too (24 g = 2 servings).
  assertEquals(
    resolveItem("pre", 2, "scoop", g).amounts.find((a) => a.substanceId === "caffeine")?.amount,
    400,
  );
  assertEquals(
    resolveItem("pre", 24, "g", g).amounts.find((a) => a.substanceId === "creatine")?.amount,
    10,
  );
});

Deno.test("resolveItem: substance amounts are converted to the canonical unit", () => {
  // Component declares sodium in g, but sodium's canonical unit is mg.
  const g = graph([{
    id: "salt",
    defaultDisplayQuantity: 1,
    defaultDisplayUnit: "serving",
    defaultCanonicalQuantity: null,
    defaultCanonicalUnit: null,
    components: [{ substanceId: "sodium", childItemId: null, amount: 0.5, unit: "g" }],
  }], { sodium: "mg" });
  assertEquals(resolveItem("salt", 1, "serving", g).amounts[0], {
    substanceId: "sodium",
    amount: 500,
    unit: "mg",
  });
});

Deno.test("resolveItem: recipe recurses through child items and sums", () => {
  // Smoothie (1 glass) = 30 g whey + 1 banana.
  // whey: 30 g serving → 24 g protein.  banana: 1 medium → 27 g carbohydrate.
  const g = graph([
    {
      id: "smoothie",
      defaultDisplayQuantity: 1,
      defaultDisplayUnit: "glass",
      defaultCanonicalQuantity: null,
      defaultCanonicalUnit: null,
      components: [
        { substanceId: null, childItemId: "whey", amount: 30, unit: "g" },
        { substanceId: null, childItemId: "banana", amount: 1, unit: "medium" },
      ],
    },
    {
      id: "whey",
      defaultDisplayQuantity: 30,
      defaultDisplayUnit: "g",
      defaultCanonicalQuantity: 30,
      defaultCanonicalUnit: "g",
      components: [{ substanceId: "protein", childItemId: null, amount: 24, unit: "g" }],
    },
    {
      id: "banana",
      defaultDisplayQuantity: 1,
      defaultDisplayUnit: "medium",
      defaultCanonicalQuantity: 120,
      defaultCanonicalUnit: "g",
      components: [{ substanceId: "carbohydrate", childItemId: null, amount: 27, unit: "g" }],
    },
  ], { protein: "g", carbohydrate: "g" });

  const one = resolveItem("smoothie", 1, "glass", g);
  assert(one.complete);
  const m = new Map(one.amounts.map((a) => [a.substanceId, a.amount]));
  assertEquals(m.get("protein"), 24);
  assertEquals(m.get("carbohydrate"), 27);

  // Two glasses doubles everything downstream.
  const two = resolveItem("smoothie", 2, "glass", g);
  assertEquals(new Map(two.amounts.map((a) => [a.substanceId, a.amount])).get("protein"), 48);
});

Deno.test("resolveItem: unreconcilable serving marks the result incomplete", () => {
  const g = graph([{
    id: "salad",
    defaultDisplayQuantity: 1,
    defaultDisplayUnit: "bowl",
    defaultCanonicalQuantity: null,
    defaultCanonicalUnit: null,
    components: [{ substanceId: "protein", childItemId: null, amount: 40, unit: "g" }],
  }], { protein: "g" });
  // Logged in grams, but the item only knows "bowl" — can't compute servings.
  const r = resolveItem("salad", 200, "g", g);
  assertEquals(r.complete, false);
  assertEquals(r.amounts.length, 0);
});

Deno.test("resolveItem: a cycle is broken and flagged incomplete", () => {
  const g = graph([{
    id: "loop",
    defaultDisplayQuantity: 1,
    defaultDisplayUnit: "serving",
    defaultCanonicalQuantity: null,
    defaultCanonicalUnit: null,
    components: [{ substanceId: null, childItemId: "loop", amount: 1, unit: "serving" }],
  }], {});
  assertEquals(resolveItem("loop", 1, "serving", g).complete, false);
});
