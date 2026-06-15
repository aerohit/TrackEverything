import { describe, expect, it } from "vitest";
import { orderTotals } from "./totals";
import type { DailyTotal } from "$lib/types";

function t(substance: string, substanceType: string): DailyTotal {
  return { substance, substanceType, amount: 1, unit: "g" };
}

describe("orderTotals", () => {
  it("orders calories → macros → vitamins → minerals/electrolytes → rest", () => {
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
      t("fiber", "macronutrient"),
    ];
    expect(orderTotals(input).map((x) => x.substance)).toEqual([
      "calories",
      "protein",
      "carbohydrate",
      "fat",
      "vitamin_d",
      "magnesium",
      "sodium",
      "caffeine",
      "fiber",
    ]);
  });

  it("is alphabetical within the vitamins/minerals and 'rest' tiers", () => {
    const input: DailyTotal[] = [
      t("zinc", "mineral"),
      t("calcium", "mineral"),
      t("vitamin_c", "vitamin"),
      t("alcohol", "psychoactive"),
      t("creatine", "supplement_compound"),
    ];
    expect(orderTotals(input).map((x) => x.substance)).toEqual([
      "vitamin_c", // vitamins (rank 10)
      "calcium", // minerals (rank 11), alphabetical
      "zinc",
      "alcohol", // rest (rank 20), alphabetical
      "creatine",
    ]);
  });
});
