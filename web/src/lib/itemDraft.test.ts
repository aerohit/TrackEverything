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
      comps: [{ substance: "caffeine", amount: 200, unit: "mg" }],
    });
  });

  it("draftFromBody falls back to sane defaults when fields are missing", () => {
    expect(draftFromBody({ name: "X", kind: "simple", primaryType: "food" })).toEqual({
      name: "X",
      kind: "simple",
      primaryType: "food",
      dispQty: 1,
      dispUnit: "serving",
      comps: [],
    });
  });

  it("draftToBody trims, builds the serving, and drops blank/zero ingredient rows", () => {
    const body = draftToBody({
      name: "  Steak ",
      kind: "simple",
      primaryType: "food",
      dispQty: 100,
      dispUnit: " g ",
      comps: [
        { substance: " protein ", amount: 26, unit: " g " },
        { substance: "", amount: 5, unit: "g" }, // dropped (no name)
        { substance: "fat", amount: 0, unit: "g" }, // dropped (zero)
      ],
    });
    expect(body).toEqual({
      name: "Steak",
      kind: "simple",
      primaryType: "food",
      defaultServing: { displayQuantity: 100, displayUnit: "g" },
      components: [{ substance: "protein", amount: 26, unit: "g" }],
    });
  });

  it("emptyDraft round-trips through draftToBody to a minimal body", () => {
    const body = draftToBody({ ...emptyDraft(), name: "Water" });
    expect(body.name).toBe("Water");
    expect(body.components).toEqual([]);
    expect(body.defaultServing).toEqual({ displayQuantity: 1, displayUnit: "serving" });
  });
});
