import { assert, assertEquals } from "@std/assert";
import { extractJson, parseScannedItem } from "./scan.ts";

Deno.test("extractJson: pulls JSON out of prose / code fences", () => {
  assertEquals(extractJson('here it is: {"a":1} done'), { a: 1 });
  assertEquals(extractJson('```json\n{"b":2}\n```'), { b: 2 });
  assertEquals(extractJson("no json here"), {});
  assertEquals(extractJson("{bad json"), {});
});

Deno.test("parseScannedItem: maps a label into an editable draft", () => {
  const draft = parseScannedItem({
    name: "  My Multivitamin ",
    serving: { displayQuantity: 2, displayUnit: "tablet" },
    components: [
      { substance: "Vitamin D", amount: 25, unit: "mcg" },
      { substance: "niacin", amount: 16, unit: "mg" },
      { substance: "", amount: 5, unit: "mg" }, // dropped (no name)
      { substance: "zinc", amount: 0, unit: "mg" }, // dropped (non-positive)
      { substance: "iron" }, // dropped (no amount/unit)
    ],
  });
  assertEquals(draft.name, "My Multivitamin");
  assertEquals(draft.kind, "product");
  assertEquals(draft.defaultServing, { displayQuantity: 2, displayUnit: "tablet" });
  assertEquals(draft.components, [
    { substance: "Vitamin D", amount: 25, unit: "mcg" },
    { substance: "niacin", amount: 16, unit: "mg" },
  ]);
});

Deno.test("parseScannedItem: tolerant defaults for garbage / missing fields", () => {
  const draft = parseScannedItem({ name: 123 });
  assertEquals(draft.name, ""); // non-string → user fills it in
  assertEquals(draft.defaultServing, { displayQuantity: 1, displayUnit: "serving" });
  assertEquals(draft.components, []);
  assert(draft.kind === "product");

  const empty = parseScannedItem(null);
  assertEquals(empty.components, []);
  assertEquals(empty.name, "");
});
