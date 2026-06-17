/**
 * Fuzzy time buckets (v2-C6) — for logging after the fact ("I had it this
 * morning"). Maps a vague time-of-day to an estimated local datetime today.
 * Pure, so it's unit-tested; the picked time is low-confidence.
 */
export interface FuzzyTime {
  label: string;
  hour: number;
  minute: number;
}

export const FUZZY_TIMES: FuzzyTime[] = [
  { label: "Morning", hour: 8, minute: 0 },
  { label: "Noon", hour: 12, minute: 30 },
  { label: "Afternoon", hour: 15, minute: 0 },
  { label: "Evening", hour: 19, minute: 0 },
  { label: "Night", hour: 22, minute: 0 },
];

const pad = (n: number) => String(n).padStart(2, "0");

/** A bucket → a local `YYYY-MM-DDTHH:MM` (datetime-local value) on `now`'s date. */
export function fuzzyWhen(b: FuzzyTime, now: Date): string {
  const d = new Date(now);
  d.setHours(b.hour, b.minute, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${
    pad(d.getMinutes())
  }`;
}
