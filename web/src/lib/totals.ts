/**
 * Order daily totals for display: calories first, then the macros (protein, carbs,
 * fat), then vitamins, then minerals/electrolytes, then everything else — each tier
 * alphabetical within itself. Pure, so it's unit-tested.
 */
import type { DailyTotal } from "$lib/types";

const NAMED_RANK: Record<string, number> = {
  calories: 0,
  protein: 1,
  carbohydrate: 2,
  fat: 3,
};

function rank(t: DailyTotal): number {
  if (t.substance in NAMED_RANK) return NAMED_RANK[t.substance];
  if (t.substanceType === "vitamin") return 10;
  if (t.substanceType === "mineral" || t.substanceType === "electrolyte") return 11;
  return 20;
}

export function orderTotals(totals: DailyTotal[]): DailyTotal[] {
  return totals.slice().sort((a, b) => rank(a) - rank(b) || a.substance.localeCompare(b.substance));
}
