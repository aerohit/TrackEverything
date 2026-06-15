/**
 * Group daily totals for display under sub-headers:
 *   - Macros:  calories, protein, carbohydrate, fat (in that order)
 *   - Micros:  vitamins, then minerals/electrolytes (alphabetical within)
 *   - Others:  everything else (alphabetical)
 * Empty groups are dropped. Pure, so it's unit-tested.
 */
import type { DailyTotal } from "$lib/types";

export interface TotalGroup {
  label: string;
  items: DailyTotal[];
}

const MACRO_ORDER = ["calories", "protein", "carbohydrate", "fat"];

function isMicro(t: DailyTotal): boolean {
  return t.substanceType === "vitamin" || t.substanceType === "mineral" ||
    t.substanceType === "electrolyte";
}

export function groupTotals(totals: DailyTotal[]): TotalGroup[] {
  const macros = totals
    .filter((t) => MACRO_ORDER.includes(t.substance))
    .sort((a, b) => MACRO_ORDER.indexOf(a.substance) - MACRO_ORDER.indexOf(b.substance));

  const byName = (a: DailyTotal, b: DailyTotal) => a.substance.localeCompare(b.substance);

  const micros = totals
    .filter((t) => !MACRO_ORDER.includes(t.substance) && isMicro(t))
    // vitamins before minerals/electrolytes, alphabetical within each.
    .sort((a, b) =>
      (a.substanceType === "vitamin" ? 0 : 1) - (b.substanceType === "vitamin" ? 0 : 1) ||
      byName(a, b)
    );

  const others = totals
    .filter((t) => !MACRO_ORDER.includes(t.substance) && !isMicro(t))
    .sort(byName);

  return [
    { label: "Macros", items: macros },
    { label: "Micros", items: micros },
    { label: "Others", items: others },
  ].filter((g) => g.items.length > 0);
}
