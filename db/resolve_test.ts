import { assert, assertEquals } from "@std/assert";
import {
  convert,
  convertForSubstance,
  type ResolveGraph,
  type ResolveItem,
  resolveItem,
} from "./resolve.ts";
import type { SubstanceUnit } from "../shared/inputs.ts";

Deno.test("convert: normalizes within a dimension, rejects across", () => {
  assertEquals(convert(1, "g", "mg"), 1000);
  assertEquals(convert(500, "mg", "g"), 0.5);
  assertEquals(convert(1, "l", "ml"), 1000);
  assertEquals(convert(2, "scoop", "scoop"), 2); // same unit passes through
  assertEquals(convert(1, "g", "ml"), null); // mass↔volume not convertible
  assertEquals(convert(1, "scoop", "g"), null); // unknown unit
  // Count units tolerate a singular/plural difference (and surrounding space).
  assertEquals(convert(1, "scoop", "scoops"), 1);
  assertEquals(convert(2, "spoons", "spoon"), 2);
  assertEquals(convert(1, " tablet ", "tablets"), 1);
});

Deno.test("convertForSubstance: substance-specific IU → canonical, else generic", () => {
  // Generic dimensional conversion still works (delegates to `convert`).
  assertEquals(convertForSubstance(5, "mg", "mcg", "Anything"), 5000);
  // IU → canonical for the known fat-soluble vitamins.
  assertEquals(convertForSubstance(1000, "iu", "mcg", "Cholecalciferol"), 25); // vit D: ×0.025
  assertEquals(convertForSubstance(400, "iu", "mcg", "Vitamin D"), 10);
  assertEquals(convertForSubstance(3000, "iu", "mcg", "Retinol"), 900); // vit A: ×0.3
  assertEquals(convertForSubstance(400, "iu", "mg", "Tocopherol"), 268); // vit E: ×0.67
  // IU with no factor / wrong target unit / no name → null (still dropped, as before).
  assertEquals(convertForSubstance(100, "iu", "mcg", "Caffeine"), null);
  assertEquals(convertForSubstance(1000, "iu", "mg", "Cholecalciferol"), null); // factor is mcg
  assertEquals(convertForSubstance(1000, "iu", "mcg"), null); // no substance name
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

Deno.test("resolveItem: 'serving' resolves against any serving unit name", () => {
  // Electrolyte powder: 1 serving = 2 scoops; 1000 mg sodium per serving.
  const g = graph([{
    id: "lyte",
    defaultDisplayQuantity: 2,
    defaultDisplayUnit: "scoops",
    defaultCanonicalQuantity: null,
    defaultCanonicalUnit: null,
    components: [{ substanceId: "sodium", childItemId: null, amount: 1000, unit: "mg" }],
  }], { sodium: "mg" });

  // Logged as "1 serving" — doesn't match "scoops", but a serving is one default serving.
  const one = resolveItem("lyte", 1, "serving", g);
  assert(one.complete);
  assertEquals(one.amounts[0], { substanceId: "sodium", amount: 1000, unit: "mg" });
  // Half a serving halves the actives ("servings" plural also accepted).
  assertEquals(resolveItem("lyte", 0.5, "servings", g).amounts[0].amount, 500);

  // A non-serving unit that still can't reconcile remains incomplete (unchanged).
  assertEquals(resolveItem("lyte", 1, "tablet", g).complete, false);
});

Deno.test("resolveItem: partial serving — '2 spoon' equals '0.5 serving' (4-spoon serving)", () => {
  // The user's example: serving size is 4 spoons; 800 mg magnesium per serving.
  const g = graph([{
    id: "mag",
    defaultDisplayQuantity: 4,
    defaultDisplayUnit: "spoon",
    defaultCanonicalQuantity: null,
    defaultCanonicalUnit: null,
    components: [{ substanceId: "magnesium", childItemId: null, amount: 800, unit: "mg" }],
  }], { magnesium: "mg" });

  const amt = (q: number, u: string) => resolveItem("mag", q, u, g).amounts[0].amount;

  // Taking 2 of the 4 spoons, or "half a serving", both = half the actives — and equal.
  assertEquals(amt(2, "spoon"), 400);
  assertEquals(amt(0.5, "serving"), 400);
  assertEquals(amt(2, "spoon"), amt(0.5, "serving"));

  // A full serving either way → the full amount (plural "spoons" tolerated).
  assertEquals(amt(4, "spoons"), 800);
  assertEquals(amt(1, "serving"), 800);
});

Deno.test("resolveItem: prod 'Bulk Electrolyte Powder' — half serving = half the electrolytes", () => {
  // From production: serving = 2 scoops; per serving sodium 1034 / potassium 306 /
  // calcium 184 / magnesium 30 (all mg).
  const g = graph([{
    id: "lyte",
    defaultDisplayQuantity: 2,
    defaultDisplayUnit: "scoops",
    defaultCanonicalQuantity: null,
    defaultCanonicalUnit: null,
    components: [
      { substanceId: "sodium", childItemId: null, amount: 1034, unit: "mg" },
      { substanceId: "potassium", childItemId: null, amount: 306, unit: "mg" },
      { substanceId: "calcium", childItemId: null, amount: 184, unit: "mg" },
      { substanceId: "magnesium", childItemId: null, amount: 30, unit: "mg" },
    ],
  }], { sodium: "mg", potassium: "mg", calcium: "mg", magnesium: "mg" });

  const amounts = (q: number, u: string) =>
    new Map(resolveItem("lyte", q, u, g).amounts.map((a) => [a.substanceId, a.amount]));

  // Full serving (2 scoops) → the label amounts.
  const full = amounts(2, "scoops");
  assertEquals(full.get("sodium"), 1034);
  assertEquals(full.get("magnesium"), 30);

  // "0.5 serving" and "1 scoop" (singular) are equivalent — exactly half of each active.
  const byServing = amounts(0.5, "serving");
  const byScoop = amounts(1, "scoop");
  assertEquals([...byServing.entries()].sort(), [...byScoop.entries()].sort());
  assertEquals(byScoop.get("sodium"), 517);
  assertEquals(byScoop.get("potassium"), 153);
  assertEquals(byScoop.get("calcium"), 92);
  assertEquals(byScoop.get("magnesium"), 15);
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
