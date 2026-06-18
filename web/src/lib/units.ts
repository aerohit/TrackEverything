/**
 * Common display units for the Log capture unit dropdown (ADR-020). These are the
 * human "serving" units a log carries (scoop, bowl, cup…) — distinct from the
 * canonical analytical units (g/mg/mcg/ml/kcal/iu/cfu) the resolver normalizes to.
 * The list isn't exhaustive; `unitOptions` keeps any current value selectable even
 * if a recognizer returned something off-list.
 */
export const DISPLAY_UNITS: string[] = [
  "serving",
  "piece",
  "scoop",
  "tablet",
  "capsule",
  "softgel",
  "drop",
  "spoon",
  "cup",
  "mug",
  "glass",
  "bottle",
  "can",
  "shot",
  "bowl",
  "plate",
  "slice",
  "handful",
  "bar",
  "packet",
  "tbsp",
  "tsp",
  "oz",
  "fl oz",
  "g",
  "kg",
  "mg",
  "mcg",
  "ml",
  "l",
  "iu",
  "kcal",
];

/** The dropdown options, guaranteeing `current` is present (and first) when off-list. */
export function unitOptions(current?: string): string[] {
  const c = (current ?? "").trim();
  if (c && !DISPLAY_UNITS.includes(c)) return [c, ...DISPLAY_UNITS];
  return [...DISPLAY_UNITS];
}

/**
 * Canonical analytical units an ingredient/substance amount can carry — the units
 * the resolver normalizes to (mirrors `SUBSTANCE_UNITS` in shared/inputs.ts).
 */
export const SUBSTANCE_UNITS: string[] = ["g", "mg", "mcg", "ml", "kcal", "iu", "cfu"];

/**
 * Units valid for a "serving in grams/ml" measurement — only mass/volume, since the
 * resolver must convert a weight/volume log against it (g/mg/mcg, ml/l).
 */
export const SERVING_MEASURE_UNITS: string[] = ["g", "mg", "mcg", "ml", "l"];

function withCurrent(list: string[], current?: string): string[] {
  const c = (current ?? "").trim();
  return c && !list.includes(c) ? [c, ...list] : [...list];
}

/** Ingredient-unit dropdown options (keeps an off-list `current` selectable). */
export function substanceUnitOptions(current?: string): string[] {
  return withCurrent(SUBSTANCE_UNITS, current);
}

/** Canonical-serving-unit dropdown options (keeps an off-list `current` selectable). */
export function measureUnitOptions(current?: string): string[] {
  return withCurrent(SERVING_MEASURE_UNITS, current);
}
