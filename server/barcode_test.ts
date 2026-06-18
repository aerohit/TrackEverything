import { assert, assertEquals } from "@std/assert";
import { OpenFoodFactsLookup } from "./barcode_off.ts";
import { parseOffProduct } from "./barcode.ts";

Deno.test("parseOffProduct: per-serving nutriments → draft with canonical gram serving", () => {
  const draft = parseOffProduct({
    product: {
      product_name: "  Greek Yogurt ",
      brands: "Fage, Total",
      categories_tags: ["en:dairies", "en:yogurts"],
      serving_quantity: "170",
      serving_size: "170 g",
      nutriments: {
        "energy-kcal_serving": 120,
        "energy-kcal_100g": 71,
        "proteins_serving": 17,
        "proteins_100g": 10,
        "carbohydrates_serving": 6,
        "sugars_serving": 6,
        "fat_serving": 3.5,
        "sodium_serving": 0.06,
      },
    },
  }, "0123456789012");

  assertEquals(draft?.name, "Greek Yogurt");
  assertEquals(draft?.kind, "product");
  assertEquals(draft?.brand, "Fage"); // first of the comma list
  // Per-serving basis → 1 serving, with the known weight as the canonical serving.
  assertEquals(draft?.defaultServing, {
    displayQuantity: 1,
    displayUnit: "serving",
    canonicalQuantity: 170,
    canonicalUnit: "g",
  });
  assertEquals(draft?.components, [
    { substance: "calories", amount: 120, unit: "kcal" },
    { substance: "protein", amount: 17, unit: "g" },
    { substance: "carbohydrate", amount: 6, unit: "g" },
    { substance: "sugar", amount: 6, unit: "g" },
    { substance: "fat", amount: 3.5, unit: "g" },
    { substance: "sodium", amount: 0.06, unit: "g" }, // resolver converts g→mg at log time
  ]);
});

Deno.test("parseOffProduct: only per-100g figures → a 100 g serving", () => {
  const draft = parseOffProduct({
    product: {
      product_name: "Orange Juice",
      categories_tags: ["en:beverages", "en:fruit-juices"],
      nutriments: { "energy-kcal_100g": 45, "carbohydrates_100g": 10, "sugars_100g": 9 },
    },
  }, "5000112637939");

  assertEquals(draft?.defaultServing, { displayQuantity: 100, displayUnit: "g" });
  assertEquals(draft?.components, [
    { substance: "calories", amount: 45, unit: "kcal" },
    { substance: "carbohydrate", amount: 10, unit: "g" },
    { substance: "sugar", amount: 9, unit: "g" },
  ]);
  assert(draft?.brand === undefined);
});

Deno.test("parseOffProduct: no product / nothing usable → null", () => {
  assertEquals(parseOffProduct({ status: 0 }, "000"), null); // OFF "not found"
  assertEquals(parseOffProduct({}, "000"), null);
  // A product object with neither a name nor any mapped nutrient is not worth saving.
  assertEquals(parseOffProduct({ product: { nutriments: { "fiber_100g": 0 } } }, "000"), null);
});

Deno.test("OpenFoodFactsLookup: 404 from upstream → null (unknown barcode)", async () => {
  const lookup = new OpenFoodFactsLookup(
    () => Promise.resolve(new Response("not found", { status: 404 })),
  );
  assertEquals(await lookup.lookup("0000000000000"), null);
});

Deno.test("OpenFoodFactsLookup: maps a found product; non-404 errors throw", async () => {
  const body = JSON.stringify({
    product: { product_name: "Test Bar", nutriments: { "proteins_serving": 20 } },
  });
  const ok = new OpenFoodFactsLookup(
    () => Promise.resolve(new Response(body, { status: 200 })),
  );
  const draft = await ok.lookup("0123456789012");
  assertEquals(draft?.name, "Test Bar");
  assertEquals(draft?.components, [{ substance: "protein", amount: 20, unit: "g" }]);

  const boom = new OpenFoodFactsLookup(
    () => Promise.resolve(new Response("oops", { status: 500 })),
  );
  let threw = false;
  try {
    await boom.lookup("0123456789012");
  } catch {
    threw = true;
  }
  assert(threw, "a 5xx from Open Food Facts should throw");
});
