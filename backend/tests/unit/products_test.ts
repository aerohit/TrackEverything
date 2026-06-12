import { assertEquals } from "@std/assert";
import {
  canonicalize,
  expandToIngredients,
  parseIngredientCandidates,
  validateNewProduct,
} from "../../src/products.ts";

Deno.test("validateNewProduct: accepts a valid product", () => {
  assertEquals(
    validateNewProduct({
      name: "sleep stack",
      category: "supplement",
      ingredients: [{ name: "magnesium glycinate", amount: 200, unit: "mg" }],
    }),
    [],
  );
});

Deno.test("validateNewProduct: rejects empty name, unknown category, empty ingredients", () => {
  const errors = validateNewProduct({ name: "", category: "telepathy", ingredients: [] });
  assertEquals(errors.some((e) => e.includes("name")), true);
  assertEquals(errors.some((e) => e.includes("category")), true);
  assertEquals(errors.some((e) => e.includes("ingredients")), true);
});

Deno.test("validateNewProduct: flags a bad ingredient", () => {
  const errors = validateNewProduct({
    name: "x",
    category: "supplement",
    ingredients: [{ name: "", amount: "lots" as unknown as number }],
  });
  assertEquals(errors.some((e) => e.includes("ingredients[0].name")), true);
  assertEquals(errors.some((e) => e.includes("ingredients[0].amount")), true);
});

Deno.test("expandToIngredients: scales by servings; null amounts stay null", () => {
  const out = expandToIngredients([
    { name: "Magnesium Glycinate", amount: 200, unit: "mg", canonical_name: "magnesium glycinate" },
    { name: "L-Theanine", amount: 100, unit: "mg", canonical_name: "l-theanine" },
    { name: "Proprietary blend", amount: null, unit: null, canonical_name: "proprietary blend" },
  ], 2);
  assertEquals(out.map((i) => i.amount), [400, 200, null]);
  assertEquals(out[0].unit, "mg");
});

Deno.test("expandToIngredients: defaults to 1 serving and canonicalizes when missing", () => {
  const out = expandToIngredients([
    { name: "Vitamin D3", amount: 50, unit: "mcg", canonical_name: null },
  ]);
  assertEquals(out[0].amount, 50);
  assertEquals(out[0].canonical_name, "vitamin d3");
});

Deno.test("parseIngredientCandidates: maps vision JSON, drops nameless entries", () => {
  const out = parseIngredientCandidates({
    ingredients: [
      { name: "Magnesium Glycinate", amount: 200, unit: "mg" },
      { name: "L-Theanine", amount: 100, unit: "mg" },
      { amount: 5 },
    ],
  });
  assertEquals(out.length, 2);
  assertEquals(out[0], { name: "Magnesium Glycinate", amount: 200, unit: "mg" });
});

Deno.test("parseIngredientCandidates: tolerates junk", () => {
  assertEquals(parseIngredientCandidates({}), []);
  assertEquals(parseIngredientCandidates(null), []);
});

Deno.test("canonicalize: lowercases and trims", () => {
  assertEquals(canonicalize("  Magnesium Glycinate "), "magnesium glycinate");
});
