/** A catalog item the recognized/typed intake can be attached to. */
export type Match = { id: string; name: string; kind?: string };

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
