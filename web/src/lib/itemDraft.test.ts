import { describe, expect, it } from "vitest";
import { draftFromBody, draftToBody, emptyDraft } from "./itemDraft";

describe("itemDraft converters", () => {
  it("draftFromBody pre-fills name/kind/type/serving and keeps substance components", () => {
    const d = draftFromBody({
      name: "Pre-Workout",
      kind: "product",
      primaryType: "supplement",
      defaultServing: { displayQuantity: 2, displayUnit: "scoops" },
      components: [
        { substance: "caffeine", amount: 200, unit: "mg" },
        { childItemId: "x", amount: 1, unit: "serving" }, // dropped (no substance)
      ],
    });
    expect(d).toEqual({
      name: "Pre-Workout",
      kind: "product",
      primaryType: "supplement",
      dispQty: 2,
      dispUnit: "scoops",
      canonQty: null,
      canonUnit: "",
      comps: [{ substance: "caffeine", amount: 200, unit: "mg" }],
      members: [],
    });
  });

  it("draftFromBody falls back to sane defaults when fields are missing", () => {
    expect(draftFromBody({ name: "X", kind: "simple", primaryType: "food" })).toEqual({
      name: "X",
      kind: "simple",
      primaryType: "food",
      dispQty: 1,
      dispUnit: "serving",
      canonQty: null,
      canonUnit: "",
      comps: [],
      members: [],
    });
  });

  it("draftFromBody / draftToBody round-trip a canonical serving (\"1 steak = 250 g\")", () => {
    const d = draftFromBody({
      name: "Steak",
      kind: "simple",
      primaryType: "food",
      defaultServing: { displayQuantity: 1, displayUnit: "steak", canonicalQuantity: 250, canonicalUnit: "g" },
      components: [{ substance: "protein", amount: 62, unit: "g" }],
    });
    expect(d.canonQty).toBe(250);
    expect(d.canonUnit).toBe("g");
    expect(draftToBody(d).defaultServing).toEqual({
      displayQuantity: 1,
      displayUnit: "steak",
      canonicalQuantity: 250,
      canonicalUnit: "g",
    });
  });

  it("draftToBody trims, builds the serving (incl. canonical), and drops blank/zero rows", () => {
    const body = draftToBody({
      name: "  Steak ",
      kind: "simple",
      primaryType: "food",
      dispQty: 1,
      dispUnit: " steak ",
      canonQty: 250,
      canonUnit: " g ",
      comps: [
        { substance: " protein ", amount: 62, unit: " g " },
        { substance: "", amount: 5, unit: "g" }, // dropped (no name)
        { substance: "fat", amount: 0, unit: "g" }, // dropped (zero)
      ],
      members: [],
    });
    expect(body).toEqual({
      name: "Steak",
      kind: "simple",
      primaryType: "food",
      defaultServing: { displayQuantity: 1, displayUnit: "steak", canonicalQuantity: 250, canonicalUnit: "g" },
      components: [{ substance: "protein", amount: 62, unit: "g" }],
    });
  });

  it("draftToBody omits a zero/blank canonical serving", () => {
    const body = draftToBody({ ...emptyDraft(), name: "Banana", dispQty: 1, dispUnit: "medium", canonQty: 0, canonUnit: "" });
    expect(body.defaultServing).toEqual({ displayQuantity: 1, displayUnit: "medium" });
  });

  it("draftToBody turns stack members into childItemId components (skipping unresolved ones)", () => {
    const body = draftToBody({
      ...emptyDraft(),
      name: "Morning Stack",
      kind: "stack",
      members: [
        { itemId: "vd-id", name: "Vitamin D", quantity: 1, unit: "tablet" },
        { itemId: "mg-id", name: "Magnesium", quantity: 2, unit: "capsule" },
        { itemId: "", name: "Typo", quantity: 1, unit: "serving" }, // dropped (no match)
        { itemId: "z-id", name: "Zinc", quantity: 0, unit: "tablet" }, // dropped (zero qty)
      ],
    });
    expect(body.kind).toBe("stack");
    expect(body.components).toEqual([
      { childItemId: "vd-id", amount: 1, unit: "tablet" },
      { childItemId: "mg-id", amount: 2, unit: "capsule" },
    ]);
  });

  it("emptyDraft round-trips through draftToBody to a minimal body", () => {
    const body = draftToBody({ ...emptyDraft(), name: "Water" });
    expect(body.name).toBe("Water");
    expect(body.components).toEqual([]);
    expect(body.defaultServing).toEqual({ displayQuantity: 1, displayUnit: "serving" });
  });
});
