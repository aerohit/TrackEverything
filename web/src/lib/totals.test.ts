import { describe, expect, it } from "vitest";
import { groupTotals } from "./totals";
import type { DailyTotal } from "$lib/types";

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
