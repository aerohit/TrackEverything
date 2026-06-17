/** A catalog item the recognized/typed intake can be attached to. */
export type Match = { id: string; name: string; kind?: string; unit?: string | null };

/**
 * The units allowed when logging against a chosen item: always "serving", plus the
 * item's own measurement unit (scoop, tablet, drop…) when it has a distinct one. This
 * stops mistakes like logging a "2 scoops" supplement in "bowls". A serving-like unit
 * (e.g. "serving (22.5g)") collapses to just "serving".
 */
export function servingUnitChoices(m?: { unit?: string | null } | null): string[] {
  const u = (m?.unit ?? "").trim();
  if (!u || u.toLowerCase().startsWith("serving")) return ["serving"];
  return ["serving", u];
}

/**
 * The display name to log for the current selection. When an existing item is
 * picked, the intake takes that item's own name (e.g. "Dope-Max Pre-Workout")
 * rather than the transcribed/typed text; otherwise it keeps `fallback` (the
 * recognized name, used for "save as new" and freeform logs).
 */
export function selectedName(sel: string, results: Match[], fallback: string): string {
  if (sel.startsWith("item:")) {
    const m = results.find((r) => "item:" + r.id === sel);
    if (m) return m.name;
  }
  return fallback;
}
