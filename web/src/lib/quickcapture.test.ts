import { describe, expect, it } from "vitest";
import { defaultAmountLabel, quickLogPayload } from "./quickcapture";
import type { QuickItem } from "$lib/types";

function qi(over: Partial<QuickItem> = {}): QuickItem {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Water",
    kind: "simple",
    primaryType: "drink",
    roles: [],
    brand: null,
    defaultDisplayQuantity: 500,
    defaultDisplayUnit: "ml",
    defaultCanonicalQuantity: null,
    defaultCanonicalUnit: null,
    quickOrder: 0,
    quickPresets: [],
    ...over,
  };
}

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

describe("defaultAmountLabel", () => {
  it("formats the default amount, with a sensible fallback", () => {
    expect(defaultAmountLabel(qi())).toBe("500 ml");
    expect(defaultAmountLabel(qi({ defaultDisplayQuantity: null, defaultDisplayUnit: null }))).toBe("1 serving");
  });
});
