/**
 * Resolution engine (ADR-018) — pure, so it's unit-tested without a DB.
 *
 * Given a logged `quantity × unit` of an input item, expand it into substance
 * amounts in each substance's canonical unit: scale components by how many default
 * servings were logged, and recurse through recipe child-items. Resolution is
 * linear, so a child contributes `resolve(child) × parentMultiplier`.
 *
 * Units are normalized within a dimension (mass g/mg/mcg, volume ml/l/…, energy
 * kcal); anything else (scoop, tablet, iu, count) only matches itself. A serving or
 * component whose units can't be reconciled is skipped and marks the result
 * `complete = false`, so the caller can lower the confidence.
 */
import type { SubstanceUnit } from "../shared/inputs.ts";

const MASS: Record<string, number> = {
  g: 1,
  mg: 1e-3,
  mcg: 1e-6,
  ug: 1e-6,
  "µg": 1e-6,
  kg: 1000,
  oz: 28.349523125,
};
// Cooking measures use the US FDA "legal" equivalents (tbsp 15 / tsp 5 / cup 240 /
// fl oz 30 ml) — internally consistent (1 cup = 16 tbsp = 8 fl oz) and matching the
// product catalog (which already serves e.g. milk as "1 cup = 240 ml").
const VOLUME: Record<string, number> = {
  ml: 1,
  cl: 10,
  dl: 100,
  l: 1000,
  tsp: 5,
  tbsp: 15,
  "fl oz": 30,
  cup: 240,
};
const ENERGY: Record<string, number> = { kcal: 1 };

/** Strip a simple trailing-"s" plural so "scoops" and "scoop" reconcile. */
function singular(u: string): string {
  return u.length > 1 && u.endsWith("s") ? u.slice(0, -1) : u;
}

/** Convert `amount` from one unit to another within the same dimension, else null. */
export function convert(amount: number, from: string, to: string): number | null {
  const f = from.trim().toLowerCase();
  const t = to.trim().toLowerCase();
  if (f === t) return amount;
  for (const table of [MASS, VOLUME, ENERGY]) {
    if (f in table && t in table) return (amount * table[f]) / table[t];
  }
  // Count units (scoop, tablet, drop, spoon…) only match themselves, but tolerate a
  // singular/plural difference: "1 scoop" of a "2 scoops" serving = half a serving.
  if (singular(f) === singular(t)) return amount;
  return null;
}

/**
 * IU ↔ mass conversion is substance-specific (1 IU of vitamin D ≠ 1 IU of vitamin E),
 * so it can't live in the generic `convert`. This table gives, per substance (matched
 * by normalized name), how much of its canonical unit one IU equals — for the
 * fat-soluble vitamins commonly labelled in IU. Extend as needed.
 */
const IU_TO_CANONICAL: Record<string, { factor: number; unit: SubstanceUnit }> = {
  // Vitamin D (D2 & D3): 40 IU = 1 mcg → 1 IU = 0.025 mcg.
  cholecalciferol: { factor: 0.025, unit: "mcg" },
  ergocalciferol: { factor: 0.025, unit: "mcg" },
  vitamin_d: { factor: 0.025, unit: "mcg" },
  // Vitamin A (retinol): 1 IU = 0.3 mcg RAE.
  retinol: { factor: 0.3, unit: "mcg" },
  vitamin_a: { factor: 0.3, unit: "mcg" },
  // Vitamin E (alpha-tocopherol, natural d-form): 1 IU = 0.67 mg.
  tocopherol: { factor: 0.67, unit: "mg" },
  alpha_tocopherol: { factor: 0.67, unit: "mg" },
  mixed_tocopherols: { factor: 0.67, unit: "mg" },
  vitamin_e: { factor: 0.67, unit: "mg" },
};

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Convert `amount` to a substance's canonical unit. Tries the generic dimensional
 * conversion first; if that fails because the source is `iu`, falls back to the
 * substance-specific IU factor above (so e.g. "1000 IU" of vitamin D resolves to
 * 25 mcg instead of being dropped). Returns null when neither applies.
 */
export function convertForSubstance(
  amount: number,
  from: string,
  to: string,
  substanceName?: string,
): number | null {
  const direct = convert(amount, from, to);
  if (direct !== null) return direct;
  if (from.trim().toLowerCase() === "iu" && substanceName) {
    const iu = IU_TO_CANONICAL[normName(substanceName)];
    if (iu && iu.unit === to.trim().toLowerCase()) return amount * iu.factor;
  }
  return null;
}

export interface ResolveComponent {
  substanceId: string | null;
  childItemId: string | null;
  amount: number;
  unit: string;
}

export interface ResolveItem {
  id: string;
  defaultDisplayQuantity: number | null;
  defaultDisplayUnit: string | null;
  defaultCanonicalQuantity: number | null;
  defaultCanonicalUnit: string | null;
  components: ResolveComponent[];
}

export interface ResolveGraph {
  items: Map<string, ResolveItem>;
  /** substanceId → its canonical unit. */
  substanceUnit: Map<string, SubstanceUnit>;
  /** substanceId → its name (for substance-specific IU conversion); optional. */
  substanceName?: Map<string, string>;
}

export interface ResolvedEntry {
  substanceId: string;
  amount: number;
  unit: SubstanceUnit;
}

export interface ResolveResult {
  amounts: ResolvedEntry[];
  /** False if any serving/component couldn't be reconciled (→ lower confidence). */
  complete: boolean;
}

/** How many default servings of `item` is `quantity × unit`? Null if not reconcilable. */
function servingMultiplier(item: ResolveItem, quantity: number, unit: string): number | null {
  if (item.defaultDisplayUnit && item.defaultDisplayQuantity) {
    const c = convert(quantity, unit, item.defaultDisplayUnit);
    if (c !== null && item.defaultDisplayQuantity > 0) return c / item.defaultDisplayQuantity;
  }
  if (item.defaultCanonicalUnit && item.defaultCanonicalQuantity) {
    const c = convert(quantity, unit, item.defaultCanonicalUnit);
    if (c !== null && item.defaultCanonicalQuantity > 0) return c / item.defaultCanonicalQuantity;
  }
  // "serving"/"servings" is a universal reference to ONE default serving of the item,
  // whatever its serving unit is named (scoop, tablet, "serving (22.5g)"…). So logging
  // "1 serving" / "0.5 serving" resolves even when the unit strings don't reconcile.
  const u = unit.trim().toLowerCase();
  if (u === "serving" || u === "servings") return quantity;
  return null;
}

export function resolveItem(
  rootId: string,
  quantity: number,
  unit: string,
  graph: ResolveGraph,
): ResolveResult {
  const totals = new Map<string, number>();
  let complete = true;

  function walk(itemId: string, qty: number, u: string, scale: number, seen: Set<string>) {
    const item = graph.items.get(itemId);
    if (!item || seen.has(itemId)) {
      complete = false;
      return;
    }
    const m = servingMultiplier(item, qty, u);
    if (m === null) {
      complete = false;
      return;
    }
    const factor = m * scale;
    const nextSeen = new Set(seen).add(itemId);
    for (const c of item.components) {
      if (c.substanceId) {
        const canonical = graph.substanceUnit.get(c.substanceId);
        if (!canonical) {
          complete = false;
          continue;
        }
        const amt = convertForSubstance(
          c.amount,
          c.unit,
          canonical,
          graph.substanceName?.get(c.substanceId),
        );
        if (amt === null) {
          complete = false;
          continue;
        }
        totals.set(c.substanceId, (totals.get(c.substanceId) ?? 0) + amt * factor);
      } else if (c.childItemId) {
        walk(c.childItemId, c.amount, c.unit, factor, nextSeen);
      }
    }
  }

  walk(rootId, quantity, unit, 1, new Set());

  const amounts: ResolvedEntry[] = [];
  for (const [substanceId, amount] of totals) {
    amounts.push({
      substanceId,
      amount: Math.round(amount * 1000) / 1000,
      unit: graph.substanceUnit.get(substanceId) as SubstanceUnit,
    });
  }
  return { amounts, complete };
}
