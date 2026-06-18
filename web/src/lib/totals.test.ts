import { describe, expect, it } from "vitest";
import { groupTotals, substanceContributions } from "./totals";
import type { DailyTotal, IntakeEvent } from "$lib/types";

function t(substance: string, substanceType: string): DailyTotal {
  return { substance, substanceType, amount: 1, unit: "g" };
}

function shape(totals: DailyTotal[]) {
  return groupTotals(totals).map((g) => [g.label, g.items.map((i) => i.substance)]);
}

describe("groupTotals", () => {
  it("splits into Macros / Micros / Others with the right ordering", () => {
    const input: DailyTotal[] = [
      t("water", "water"),
      t("magnesium", "mineral"),
      t("fat", "macronutrient"),
      t("calories", "energy"),
      t("vitamin_d", "vitamin"),
      t("protein", "macronutrient"),
      t("sodium", "electrolyte"),
      t("carbohydrate", "macronutrient"),
      t("caffeine", "stimulant"),
      t("fiber", "macronutrient"), // a macronutrient, but not one of the 4 → Others
    ];
    expect(shape(input)).toEqual([
      ["Macros", ["calories", "protein", "carbohydrate", "fat"]],
      ["Micros", ["vitamin_d", "magnesium", "sodium"]], // vitamins first, then minerals/electrolytes
      ["Others", ["caffeine", "fiber", "water"]], // alphabetical
    ]);
  });

  it("drops empty groups", () => {
    expect(shape([t("calories", "energy"), t("protein", "macronutrient")])).toEqual([
      ["Macros", ["calories", "protein"]],
    ]);
  });
});

describe("substanceContributions", () => {
  function ev(displayName: string, resolved: { substance: string; amount: number; unit: string }[]): IntakeEvent {
    return {
      id: crypto.randomUUID(),
      occurredAt: "2026-06-17T08:00:00.000Z",
      displayName,
      itemId: null,
      quantity: 1,
      unit: "serving",
      contextTags: [],
      source: "manual",
      precision: "precise",
    unresolved: false,
      stackItems: [],
      resolved: resolved.map((r) => ({ ...r, confidence: "medium", source: "item" })),
    } as IntakeEvent;
  }

  const events: IntakeEvent[] = [
    ev("Steak", [{ substance: "protein", amount: 25, unit: "g" }, { substance: "fat", amount: 15, unit: "g" }]),
    ev("Eggs", [{ substance: "protein", amount: 20, unit: "g" }]),
    ev("Coffee", [{ substance: "caffeine", amount: 95, unit: "mg" }]),
  ];

  it("lists which inputs contributed to a substance, largest first", () => {
    expect(substanceContributions(events, "protein")).toEqual([
      { name: "Steak", amount: 25, unit: "g" },
      { name: "Eggs", amount: 20, unit: "g" },
    ]);
  });

  it("sums repeats of the same item and ignores other substances", () => {
    const withRepeat = [...events, ev("Eggs", [{ substance: "protein", amount: 6, unit: "g" }])];
    expect(substanceContributions(withRepeat, "protein")).toEqual([
      { name: "Eggs", amount: 26, unit: "g" }, // 20 + 6
      { name: "Steak", amount: 25, unit: "g" },
    ]);
    expect(substanceContributions(events, "fat")).toEqual([{ name: "Steak", amount: 15, unit: "g" }]);
    expect(substanceContributions(events, "vitamin_d")).toEqual([]);
  });
});
