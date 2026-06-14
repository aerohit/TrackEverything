import { assertEquals } from "@std/assert";
import { MockClaudeClient } from "../../src/claude.ts";
import { extractFoodFromImage, parseFoodCandidates } from "../../src/food.ts";

Deno.test("parseFoodCandidates: maps + sanitises the model JSON", () => {
  const out = parseFoodCandidates({
    foods: [
      {
        item: "steak",
        unit: "g",
        amount: 200,
        calories: 460,
        protein_g: 50,
        carbs_g: 0,
        fat_g: 28,
        ingredients: ["beef"],
      },
      {
        item: "fried egg",
        unit: "count",
        amount: 2,
        calories: 180,
        protein_g: 12,
        carbs_g: 1,
        fat_g: 14,
      },
    ],
  });
  assertEquals(out.length, 2);
  assertEquals(out[0], {
    item: "steak",
    unit: "g",
    amount: 200,
    calories: 460,
    protein_g: 50,
    carbs_g: 0,
    fat_g: 28,
    ingredients: ["beef"],
  });
  assertEquals(out[1].unit, "count");
  assertEquals(out[1].ingredients, []); // missing -> empty
});

Deno.test("parseFoodCandidates: drops unnamed, defaults unit, clamps negatives", () => {
  const out = parseFoodCandidates({
    foods: [
      { item: "", calories: 100 }, // no name -> dropped
      { item: "soup", unit: "bowl", amount: -3, calories: -50 }, // bad unit/values
    ],
  });
  assertEquals(out.length, 1);
  assertEquals(out[0].unit, "serving"); // unknown unit -> serving
  assertEquals(out[0].amount, 1); // <=0 -> 1
  assertEquals(out[0].calories, 0); // negative -> 0
});

Deno.test("parseFoodCandidates: tolerates malformed output", () => {
  assertEquals(parseFoodCandidates({}), []);
  assertEquals(parseFoodCandidates({ foods: "nope" }), []);
  assertEquals(parseFoodCandidates(null), []);
});

Deno.test("extractFoodFromImage: runs the vision seam and parses", async () => {
  const claude = new MockClaudeClient(undefined, {
    foods: [{
      item: "pizza slice",
      unit: "count",
      amount: 1,
      calories: 285,
      protein_g: 12,
      carbs_g: 36,
      fat_g: 10,
      ingredients: ["dough", "cheese", "tomato"],
    }],
  });
  const foods = await extractFoodFromImage(claude, { imageBase64: "x", mediaType: "image/jpeg" });
  assertEquals(foods.length, 1);
  assertEquals(foods[0].item, "pizza slice");
  assertEquals(foods[0].ingredients, ["dough", "cheese", "tomato"]);
});
