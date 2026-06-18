import { assert } from "@std/assert";
import {
  componentInputSchema,
  createIntakeEventSchema,
  createItemSchema,
  updateIntakeEventSchema,
} from "./inputs.ts";

Deno.test("componentInput: exactly one of substance or child item", () => {
  assert(
    componentInputSchema.safeParse({ substance: "caffeine", amount: 200, unit: "mg" }).success,
  );
  assert(
    componentInputSchema.safeParse({
      childItemId: crypto.randomUUID(),
      amount: 30,
      unit: "g",
    }).success,
  );
  // Neither, or both → invalid.
  assert(!componentInputSchema.safeParse({ amount: 1, unit: "g" }).success);
  assert(
    !componentInputSchema.safeParse({
      substance: "caffeine",
      childItemId: crypto.randomUUID(),
      amount: 1,
      unit: "mg",
    }).success,
  );
});

Deno.test("createItem: accepts a product with actives", () => {
  assert(
    createItemSchema.safeParse({
      name: "My Pre-workout",
      kind: "product",
      defaultServing: {
        displayQuantity: 1,
        displayUnit: "scoop",
        canonicalQuantity: 12,
        canonicalUnit: "g",
      },
      components: [{ substance: "caffeine", amount: 200, unit: "mg" }],
    }).success,
  );
  assert(
    !createItemSchema.safeParse({ name: "x", kind: "potion" }).success,
  );
});

Deno.test("createIntakeEvent: needs a positive quantity; manual amounts validate", () => {
  assert(
    createIntakeEventSchema.safeParse({ displayName: "Coffee", quantity: 1, unit: "cup" }).success,
  );
  assert(
    !createIntakeEventSchema.safeParse({ displayName: "Coffee", quantity: 0, unit: "cup" }).success,
  );
  assert(
    createIntakeEventSchema.safeParse({
      displayName: "Coffee",
      quantity: 1,
      unit: "cup",
      resolved: [{ substance: "caffeine", amount: 120, unit: "mg" }],
    }).success,
  );
  // Unknown canonical unit is rejected.
  assert(
    !createIntakeEventSchema.safeParse({
      displayName: "x",
      quantity: 1,
      unit: "cup",
      resolved: [{ substance: "caffeine", amount: 120, unit: "cups" }],
    }).success,
  );
});

Deno.test("updateIntakeEvent: rejects an empty patch", () => {
  assert(!updateIntakeEventSchema.safeParse({}).success);
  assert(updateIntakeEventSchema.safeParse({ quantity: 2 }).success);
});
