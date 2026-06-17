/**
 * Common display units for the Log capture unit dropdown (ADR-020). These are the
 * human "serving" units a log carries (scoop, bowl, cup…) — distinct from the
 * canonical analytical units (g/mg/mcg/ml/kcal/iu) the resolver normalizes to.
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
