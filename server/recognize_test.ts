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
  assertEquals(r.draft.kind, "product");
  assertEquals(r.draft.name, "Chicken Salad");
  assertEquals(r.draft.defaultServing, { displayQuantity: 1, displayUnit: "bowl" });
  assertEquals(r.draft.components, [
    { substance: "calories", amount: 420, unit: "kcal" },
    { substance: "protein", amount: 35, unit: "g" },
  ]);
});

Deno.test("parseRecognized: tolerant defaults for garbage / missing fields", () => {
  const r = parseRecognized({ quantity: -5 });
  assertEquals(r.name, "");
  assertEquals(r.quantity, 1); // non-positive/missing → 1
  assertEquals(r.unit, "serving");
  assertEquals(r.draft.components, []);
  assert(r.draft.kind === "product");

  const empty = parseRecognized(null);
  assertEquals(empty.name, "");
  assertEquals(empty.draft.components, []);
});

Deno.test("parseRecognized: keeps a valid local 'when', drops malformed/absent ones", () => {
  assertEquals(
    parseRecognized({ name: "coffee", when: "2026-06-17T10:00" }).when,
    "2026-06-17T10:00",
  );
  assertEquals(
    parseRecognized({ name: "coffee", when: "  2026-06-17T10:00 " }).when,
    "2026-06-17T10:00",
  );
  assertEquals(parseRecognized({ name: "coffee", when: "10am" }).when, undefined); // not a timestamp
  assertEquals(parseRecognized({ name: "coffee", when: null }).when, undefined);
  assertEquals(parseRecognized({ name: "coffee" }).when, undefined); // no time mentioned
});
