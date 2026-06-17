/**
 * Quick Capture smart suggestions (v2-C5) — "around now you usually log X."
 * Pure + computed client-side from the last weeks of intake, so it uses the
 * browser's local time (no server timezone handling) and is unit-testable.
 */
import type { CreateIntake, IntakeEvent } from "$lib/types";

export interface TimeSuggestion {
  itemId: string;
  displayName: string;
  quantity: number;
  unit: string;
  count: number; // how many past days this item was logged around this hour
}

function sameLocalDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate();
}

/** Circular distance between two hours-of-day (0–12), so 23:00 is 1h from 00:00. */
function hourDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
}

/**
 * Items the user tends to log around `now`'s time of day: counts past (item) logs
 * whose local hour is within `windowHours` of now, excludes anything already
 * logged today, and needs at least `minCount` prior occurrences to suggest.
 * Newest-first input is assumed so the freshest amount/unit is carried.
 */
export function timeSuggestions(
  events: IntakeEvent[],
  now: Date,
  opts: { windowHours?: number; minCount?: number; max?: number } = {},
): TimeSuggestion[] {
  const windowHours = opts.windowHours ?? 2;
  const minCount = opts.minCount ?? 2;
  const max = opts.max ?? 3;
  const nowHour = now.getHours();

  const loggedToday = new Set(
    events.filter((e) => e.itemId && sameLocalDay(e.occurredAt, now)).map((e) => e.itemId as string),
  );

  const byItem = new Map<string, TimeSuggestion>();
  for (const e of events) {
    if (!e.itemId || loggedToday.has(e.itemId) || sameLocalDay(e.occurredAt, now)) continue;
    if (hourDist(new Date(e.occurredAt).getHours(), nowHour) > windowHours) continue;
    const cur = byItem.get(e.itemId);
    if (cur) cur.count++;
    else {
      byItem.set(e.itemId, {
        itemId: e.itemId,
        displayName: e.displayName,
        quantity: e.quantity,
        unit: e.unit,
        count: 1,
      });
    }
  }

  return [...byItem.values()]
    .filter((s) => s.count >= minCount)
    .sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName))
    .slice(0, max);
}

/** Log payload for tapping a suggestion (counts as a quick capture). */
export function suggestionPayload(s: TimeSuggestion): CreateIntake {
  return { displayName: s.displayName, itemId: s.itemId, quantity: s.quantity, unit: s.unit, source: "quick" };
}
