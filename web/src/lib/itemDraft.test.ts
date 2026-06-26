import { describe, expect, it } from "vitest";
import {
  draftFromBody,
  draftToBody,
  eligibleMembers,
  emptyDraft,
  hasUnresolvedMembers,
  searchMembers,
} from "./itemDraft";
import type { InputItemSummary } from "$lib/types";

function summary(over: Partial<InputItemSummary>): InputItemSummary {
  return {
    id: "x",
    name: "X",
    kind: "product",
    aliases: [],
    defaultDisplayQuantity: null,
    defaultDisplayUnit: null,
    defaultCanonicalQuantity: null,
    defaultCanonicalUnit: null,
    ...over,
  };
}

describe("eligibleMembers", () => {
  const catalog = [
    summary({ id: "p1", name: "Whey", kind: "product" }),
    summary({ id: "p2", name: "Banana", kind: "product" }),
    summary({ id: "r1", name: "Smoothie", kind: "recipe" }),
    summary({ id: "s1", name: "Morning Stack", kind: "stack" }),
  ];

  it("a recipe accepts only product items", () => {
    expect(eligibleMembers(catalog, "recipe").map((i) => i.id)).toEqual(["p1", "p2"]);
  });

  it("a stack accepts any non-stack item (products and recipes)", () => {
    expect(eligibleMembers(catalog, "stack").map((i) => i.id)).toEqual(["p1", "p2", "r1"]);
  });
});

describe("searchMembers", () => {
  const products = [
    summary({ id: "a", name: "Whey Protein" }),
    summary({ id: "b", name: "Banana" }),
    summary({ id: "c", name: "Greek Yogurt" }),
  ];

  it("matches a case-insensitive substring of the name", () => {
    expect(searchMembers(products, "yo").map((i) => i.id)).toEqual(["c"]);
    expect(searchMembers(products, "PROTEIN").map((i) => i.id)).toEqual(["a"]);
  });

  it("returns the full pool for a blank query, and caps at 8", () => {
    expect(searchMembers(products, "  ").map((i) => i.id)).toEqual(["a", "b", "c"]);
    const many = Array.from({ length: 20 }, (_, n) => summary({ id: `i${n}`, name: `Item ${n}` }));
    expect(searchMembers(many, "item")).toHaveLength(8);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchMembers(products, "zzz")).toEqual([]);
  });

  it("matches an alias (other / Dutch name), not just the name", () => {
    const items = [summary({ id: "p", name: "Potato", aliases: ["aardappel", "spud"] })];
    expect(searchMembers(items, "aardappel").map((i) => i.id)).toEqual(["p"]);
    expect(searchMembers(items, "SPU").map((i) => i.id)).toEqual(["p"]);
    expect(searchMembers(items, "carrot")).toEqual([]);
  });
});

describe("recipe draft", () => {
  it("draftToBody builds a recipe from product members (childItemId components)", () => {
    const body = draftToBody({
      ...emptyDraft(),
      name: "Protein Smoothie",
      kind: "recipe",
      dispQty: 1,
      dispUnit: "bowl",
      members: [
        { itemId: "whey-id", name: "Whey", quantity: 1, unit: "scoop" },
        { itemId: "banana-id", name: "Banana", quantity: 1, unit: "medium" },
        { itemId: "", name: "Typo", quantity: 1, unit: "serving" }, // dropped (not in catalog)
      ],
    });
    expect(body.kind).toBe("recipe");
    expect(body.components).toEqual([
      { childItemId: "whey-id", amount: 1, unit: "scoop" },
      { childItemId: "banana-id", amount: 1, unit: "medium" },
    ]);
  });
});

describe("itemDraft converters", () => {
  it("draftFromBody pre-fills name/kind/serving and keeps substance components", () => {
    const d = draftFromBody({
      name: "Pre-Workout",
      kind: "product",
      defaultServing: { displayQuantity: 2, displayUnit: "scoops" },
      components: [
        { substance: "caffeine", amount: 200, unit: "mg" },
        { childItemId: "x", amount: 1, unit: "serving" }, // dropped (no substance)
      ],
    });
    expect(d).toEqual({
      name: "Pre-Workout",
      kind: "product",
      dispQty: 2,
      dispUnit: "scoops",
      canonQty: null,
      canonUnit: "",
      comps: [{ substance: "caffeine", amount: 200, unit: "mg" }],
      members: [],
    });
  });

  it("draftFromBody falls back to sane defaults when fields are missing", () => {
    expect(draftFromBody({ name: "X", kind: "product" })).toEqual({
      name: "X",
      kind: "product",
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
      kind: "product",
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
      kind: "product",
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
      kind: "product",
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

  describe("hasUnresolvedMembers", () => {
    it("is false when there are no members or all are resolved", () => {
      expect(hasUnresolvedMembers(emptyDraft())).toBe(false);
      expect(
        hasUnresolvedMembers({
          ...emptyDraft(),
          members: [{ itemId: "a-id", name: "Apple", quantity: 1, unit: "piece" }],
        }),
      ).toBe(false);
    });

    it("is false for an empty (untouched) member row", () => {
      expect(
        hasUnresolvedMembers({
          ...emptyDraft(),
          members: [{ itemId: "", name: "", quantity: 1, unit: "serving" }],
        }),
      ).toBe(false);
    });

    it("is true when a member has a typed name but no resolved item", () => {
      // The exact case that silently dropped an ingredient: typed "brood", never picked.
      expect(
        hasUnresolvedMembers({
          ...emptyDraft(),
          members: [
            { itemId: "g-id", name: "Gouda", quantity: 1, unit: "slice" },
            { itemId: "", name: "brood", quantity: 2, unit: "slice" },
          ],
        }),
      ).toBe(true);
    });
  });
});
