/**
 * Group daily totals for display under sub-headers:
 *   - Macros:  calories, protein, carbohydrate, fat (in that order)
 *   - Micros:  vitamins, then minerals/electrolytes (alphabetical within)
 *   - Others:  everything else (alphabetical)
 * Empty groups are dropped. Pure, so it's unit-tested.
 */
import type { DailyTotal, IntakeEvent } from "$lib/types";

export interface TotalGroup {
  label: string;
  items: DailyTotal[];
}

/** One logged input's contribution to a substance's daily total. */
export interface Contribution {
  name: string;
  amount: number;
  unit: string;
}

/**
 * Which logged inputs make up a substance's daily total — e.g. for "protein":
 * [{ name: "Steak", amount: 25, ... }, { name: "Eggs", amount: 20, ... }].
 * Aggregates the per-event resolved amounts by display name, largest first. Pure.
 */
export function substanceContributions(events: IntakeEvent[], substance: string): Contribution[] {
  const byName = new Map<string, { amount: number; unit: string }>();
  for (const e of events) {
    for (const r of e.resolved) {
      if (r.substance !== substance) continue;
      const cur = byName.get(e.displayName) ?? { amount: 0, unit: r.unit };
      cur.amount += r.amount;
      cur.unit = r.unit;
      byName.set(e.displayName, cur);
    }
  }
  return [...byName.entries()]
    .map(([name, v]) => ({ name, amount: Math.round(v.amount * 1000) / 1000, unit: v.unit }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

// The four headline macros, by canonical substance name (Energy = the kcal total).
const MACRO_ORDER = ["Energy", "Protein", "Carbohydrate", "Fat"];

/** Display label for a substance — shows the kcal "Energy" total as "Calories". */
export function displaySubstance(substance: string): string {
  return substance === "Energy" ? "Calories" : substance;
}

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
