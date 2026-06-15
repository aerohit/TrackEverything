import { assert, assertEquals } from "@std/assert";
import { extractJson, parseRecognized } from "./recognize.ts";

Deno.test("extractJson: pulls JSON out of prose / code fences", () => {
  assertEquals(extractJson('sure: {"a":1} ok'), { a: 1 });
  assertEquals(extractJson('```json\n{"b":2}\n```'), { b: 2 });
  assertEquals(extractJson("nope"), {});
  assertEquals(extractJson("{bad"), {});
});

Deno.test("parseRecognized: maps a recognized intake + draft item", () => {
  const r = parseRecognized({
    name: "  Chicken Salad ",
    primaryType: "meal",
    quantity: 1,
    unit: "bowl",
    components: [
      { substance: "calories", amount: 420, unit: "kcal" },
      { substance: "protein", amount: 35, unit: "g" },
      { substance: "", amount: 5, unit: "g" }, // dropped (no name)
      { substance: "fat", amount: 0, unit: "g" }, // dropped (non-positive)
    ],
  });
  assertEquals(r.name, "Chicken Salad");
  assertEquals(r.quantity, 1);
  assertEquals(r.unit, "bowl");
  assertEquals(r.primaryType, "meal");
  assertEquals(r.draft.kind, "simple");
  assertEquals(r.draft.name, "Chicken Salad");
  assertEquals(r.draft.defaultServing, { displayQuantity: 1, displayUnit: "bowl" });
  assertEquals(r.draft.components, [
    { substance: "calories", amount: 420, unit: "kcal" },
    { substance: "protein", amount: 35, unit: "g" },
  ]);
});

Deno.test("parseRecognized: tolerant defaults for garbage / missing fields", () => {
  const r = parseRecognized({ primaryType: "nonsense" });
  assertEquals(r.name, "");
  assertEquals(r.quantity, 1); // non-positive/missing → 1
  assertEquals(r.unit, "serving");
  assertEquals(r.primaryType, "food"); // bad enum → food default
  assertEquals(r.draft.components, []);
  assert(r.draft.kind === "simple");

  const empty = parseRecognized(null);
  assertEquals(empty.name, "");
  assertEquals(empty.draft.components, []);
});
