import { describe, expect, it } from "vitest";
import {
  defaultAmountLabel,
  isStack,
  preparePresets,
  quickLogPayload,
  sizeLogPayload,
  stackLogPlan,
} from "./quickcapture";
import type { QuickItem } from "$lib/types";

function qi(over: Partial<QuickItem> = {}): QuickItem {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Water",
    kind: "simple",
    defaultDisplayQuantity: 500,
    defaultDisplayUnit: "ml",
    defaultCanonicalQuantity: null,
    defaultCanonicalUnit: null,
    quickOrder: 0,
    quickPresets: [],
    stack: [],
    ...over,
  };
}

const STACK = qi({
  id: "stack-1",
  name: "Morning Stack",
  kind: "recipe",
  defaultDisplayQuantity: 1,
  defaultDisplayUnit: "serving",
  stack: [
    { itemId: "vd", name: "Vitamin D", quantity: 1, unit: "tablet" },
    { itemId: "mg", name: "Magnesium", quantity: 1, unit: "capsule" },
    { itemId: "o3", name: "Omega-3", quantity: 2, unit: "softgel" },
  ],
});

describe("quickLogPayload", () => {
  it("logs the item's default serving when no preset is chosen", () => {
    expect(quickLogPayload(qi())).toEqual({
      displayName: "Water",
      itemId: "11111111-1111-1111-1111-111111111111",
      quantity: 500,
      unit: "ml",
      source: "quick",
    });
  });

  it("logs the chosen preset's amount over the default", () => {
    expect(quickLogPayload(qi(), { label: "1 L", quantity: 1000, unit: "ml" })).toMatchObject({
      quantity: 1000,
      unit: "ml",
    });
  });

  it("falls back to 1 serving when the item has no default amount", () => {
    expect(quickLogPayload(qi({ defaultDisplayQuantity: null, defaultDisplayUnit: null }))).toMatchObject({
      quantity: 1,
      unit: "serving",
    });
  });
});

describe("sizeLogPayload", () => {
  it("scales the default serving by the factor (Small / Large)", () => {
    expect(sizeLogPayload(qi({ defaultDisplayQuantity: 1, defaultDisplayUnit: "serving" }), 0.5))
      .toMatchObject({ quantity: 0.5, unit: "serving" });
    expect(sizeLogPayload(qi({ defaultDisplayQuantity: 50, defaultDisplayUnit: "g" }), 2))
      .toMatchObject({ quantity: 100, unit: "g" });
  });

  it("defaults the base to 1 serving and rounds", () => {
    expect(sizeLogPayload(qi({ defaultDisplayQuantity: null, defaultDisplayUnit: null }), 0.5))
      .toMatchObject({ quantity: 0.5, unit: "serving" });
    expect(sizeLogPayload(qi({ defaultDisplayQuantity: 1, defaultDisplayUnit: "serving" }), 1 / 3).quantity)
      .toBe(0.333);
  });
});

describe("defaultAmountLabel", () => {
  it("formats the default amount, with a sensible fallback", () => {
    expect(defaultAmountLabel(qi())).toBe("500 ml");
    expect(defaultAmountLabel(qi({ defaultDisplayQuantity: null, defaultDisplayUnit: null }))).toBe("1 serving");
  });
});

describe("stackLogPlan", () => {
  const all = new Set(["vd", "mg", "o3"]);

  it("flags stacks vs simple favorites", () => {
    expect(isStack(STACK)).toBe(true);
    expect(isStack(qi())).toBe(false);
  });

  it("single mode with all members → ONE event against the stack item", () => {
    const plan = stackLogPlan(STACK, all, "single");
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ itemId: "stack-1", displayName: "Morning Stack", source: "quick" });
  });

  it("separate mode → one event per member, even when all are included", () => {
    const plan = stackLogPlan(STACK, all, "separate");
    expect(plan.map((p) => p.displayName)).toEqual(["Vitamin D", "Magnesium", "Omega-3"]);
  });

  it("a skip always logs per included member (single can't represent a partial stack)", () => {
    const plan = stackLogPlan(STACK, new Set(["vd", "o3"]), "single"); // skip Magnesium
    expect(plan.map((p) => p.displayName)).toEqual(["Vitamin D", "Omega-3"]);
    expect(plan[1]).toMatchObject({ itemId: "o3", quantity: 2, unit: "softgel", source: "quick" });
  });

  it("logs nothing when every member is skipped", () => {
    expect(stackLogPlan(STACK, new Set(), "single")).toEqual([]);
  });

  it("falls back to a single quick log for a non-stack favorite", () => {
    expect(stackLogPlan(qi(), new Set(), "single")).toHaveLength(1);
  });
});

describe("preparePresets", () => {
  it("trims and accepts complete rows", () => {
    const r = preparePresets([
      { label: " 250 g ", quantity: 250, unit: " g " },
      { label: "300 g", quantity: 300, unit: "g" },
    ]);
    expect(r).toEqual({
      ok: true,
      presets: [
        { label: "250 g", quantity: 250, unit: "g" },
        { label: "300 g", quantity: 300, unit: "g" },
      ],
    });
  });

  it("accepts an empty list", () => {
    expect(preparePresets([])).toEqual({ ok: true, presets: [] });
  });

  it("blocks a row with a blank label (rather than dropping it)", () => {
    const r = preparePresets([{ label: "   ", quantity: 250, unit: "g" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/label/i);
  });

  it("blocks a non-positive quantity and a blank unit", () => {
    expect(preparePresets([{ label: "250 g", quantity: 0, unit: "g" }]).ok).toBe(false);
    expect(preparePresets([{ label: "250 g", quantity: 250, unit: "  " }]).ok).toBe(false);
  });
});
