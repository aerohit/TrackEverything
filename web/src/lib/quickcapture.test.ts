import { describe, expect, it } from "vitest";
import {
  defaultAmountLabel,
  isStack,
  preparePresets,
  presetLabel,
  quickLogPayload,
  sizeLogPayload,
  stackLogPlan,
} from "./quickcapture";
import type { QuickItem } from "$lib/types";

function qi(over: Partial<QuickItem> = {}): QuickItem {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Water",
    kind: "product",
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
    expect(quickLogPayload(qi(), { label: "1 L", quantity: 1000, unit: "ml" }))
      .toMatchObject({
        quantity: 1000,
        unit: "ml",
      });
  });

  it("falls back to 1 serving when the item has no default amount", () => {
    expect(
      quickLogPayload(
        qi({ defaultDisplayQuantity: null, defaultDisplayUnit: null }),
      ),
    ).toMatchObject({
      quantity: 1,
      unit: "serving",
    });
  });
});

describe("sizeLogPayload", () => {
  it("scales the default serving by the factor (Small / Large)", () => {
    expect(
      sizeLogPayload(
        qi({ defaultDisplayQuantity: 1, defaultDisplayUnit: "serving" }),
        0.5,
      ),
    )
      .toMatchObject({ quantity: 0.5, unit: "serving" });
    expect(
      sizeLogPayload(
        qi({ defaultDisplayQuantity: 50, defaultDisplayUnit: "g" }),
        2,
      ),
    )
      .toMatchObject({ quantity: 100, unit: "g" });
  });

  it("defaults the base to 1 serving and rounds", () => {
    expect(
      sizeLogPayload(
        qi({ defaultDisplayQuantity: null, defaultDisplayUnit: null }),
        0.5,
      ),
    )
      .toMatchObject({ quantity: 0.5, unit: "serving" });
    expect(
      sizeLogPayload(
        qi({ defaultDisplayQuantity: 1, defaultDisplayUnit: "serving" }),
        1 / 3,
      ).quantity,
    )
      .toBe(0.333);
  });
});

describe("defaultAmountLabel", () => {
  it("formats the default amount, with a sensible fallback", () => {
    expect(defaultAmountLabel(qi())).toBe("500 ml");
    expect(
      defaultAmountLabel(
        qi({ defaultDisplayQuantity: null, defaultDisplayUnit: null }),
      ),
    ).toBe("1 serving");
  });
});

describe("stackLogPlan", () => {
  const all = new Set(["vd", "mg", "o3"]);

  it("flags stacks vs non-stack favorites", () => {
    expect(isStack(STACK)).toBe(true);
    expect(isStack(qi())).toBe(false);
  });

  it("logs one event per member, each against the member item (never the stack)", () => {
    const plan = stackLogPlan(STACK, all);
    expect(plan.map((p) => p.displayName)).toEqual([
      "Vitamin D",
      "Magnesium",
      "Omega-3",
    ]);
    expect(plan.map((p) => p.itemId)).toEqual(["vd", "mg", "o3"]);
    expect(plan[0]).toMatchObject({ source: "quick" });
  });

  it("logs only the included members when some are skipped", () => {
    const plan = stackLogPlan(STACK, new Set(["vd", "o3"])); // skip Magnesium
    expect(plan.map((p) => p.displayName)).toEqual(["Vitamin D", "Omega-3"]);
    expect(plan[1]).toMatchObject({
      itemId: "o3",
      quantity: 2,
      unit: "softgel",
      source: "quick",
    });
  });

  it("logs nothing when every member is skipped", () => {
    expect(stackLogPlan(STACK, new Set())).toEqual([]);
  });

  it("falls back to a single quick log for a non-stack favorite", () => {
    expect(stackLogPlan(qi(), new Set())).toHaveLength(1);
  });
});

describe("presetLabel", () => {
  it('derives "<qty> <unit>" when no override is given', () => {
    expect(presetLabel(250, "g")).toBe("250 g");
    expect(presetLabel(500, " ml ")).toBe("500 ml");
  });

  it("prefers a non-blank override and trims it", () => {
    expect(presetLabel(250, "g", "  Big portion ")).toBe("Big portion");
  });

  it("falls back to the derived label when the override is blank", () => {
    expect(presetLabel(300, "g", "   ")).toBe("300 g");
  });

  it("is empty when the amount itself is incomplete", () => {
    expect(presetLabel(0, "g")).toBe("");
    expect(presetLabel(250, "  ")).toBe("");
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
    expect(preparePresets([{ label: "250 g", quantity: 0, unit: "g" }]).ok)
      .toBe(false);
    expect(preparePresets([{ label: "250 g", quantity: 250, unit: "  " }]).ok)
      .toBe(false);
  });
});
