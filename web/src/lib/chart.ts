/**
 * Pure transform: group a day's readings into per-kind series for the SVG chart.
 * x = fraction of the (local) day from `recordedAt`; y = the 1–5 rating. Kept
 * pure so it's unit-tested without a DOM.
 */
import type { Checkin, SubjectiveKind } from "$lib/types";

export interface Point {
  x: number;
  y: number;
}
export interface Series {
  kind: SubjectiveKind;
  points: Point[];
}
export interface DayChart {
  series: Series[];
  empty: boolean;
  /** Visible x-axis window as day-fractions (0–1). Defaults to the waking hours. */
  domain: { min: number; max: number };
  /** Whole-hour positions to label on the x-axis, within `domain`. */
  ticks: number[];
}

// Default the chart to "waking hours" (08:00–22:00) — when most check-ins happen —
// rather than the full midnight-to-midnight day, so the data fills the plot.
export const DEFAULT_START_HOUR = 8;
export const DEFAULT_END_HOUR = 22;

/** Hour labels: the window's ends plus the interior multiples of 4 (e.g. 8·12·16·20·22). */
function hourTicks(startHour: number, endHour: number): number[] {
  const set = new Set<number>([startHour, endHour]);
  for (let h = startHour + 1; h < endHour; h++) if (h % 4 === 0) set.add(h);
  return [...set].sort((a, b) => a - b);
}

/**
 * A small vertical pixel offset that fans series apart so equal ratings (e.g.
 * mood = energy = focus on a day) don't render as a single overlapping dot.
 * Centered on 0 (offsets sum to 0), so the cluster stays visually on its value.
 */
export function seriesOffset(index: number, count: number, sep = 3.5): number {
  return (index - (count - 1) / 2) * sep;
}

export function buildDayChart(checkins: Checkin[], kinds: SubjectiveKind[]): DayChart {
  const byKind = new Map<SubjectiveKind, Point[]>();
  for (const k of kinds) byKind.set(k, []);
  for (const c of checkins) {
    const arr = byKind.get(c.kind);
    if (!arr) continue;
    const d = new Date(c.recordedAt);
    arr.push({ x: (d.getHours() * 60 + d.getMinutes()) / 1440, y: c.rating });
  }
  // Window defaults to the waking hours, but widens to whole hours around any
  // reading logged outside it so an early/late outlier is never clipped away.
  let startHour = DEFAULT_START_HOUR;
  let endHour = DEFAULT_END_HOUR;
  for (const pts of byKind.values()) {
    for (const p of pts) {
      const h = p.x * 24;
      if (h < startHour) startHour = Math.floor(h);
      if (h > endHour) endHour = Math.ceil(h);
    }
  }

  const series: Series[] = [];
  for (const k of kinds) {
    const pts = (byKind.get(k) ?? []).slice().sort((a, b) => a.x - b.x);
    if (pts.length) series.push({ kind: k, points: pts });
  }
  return {
    series,
    empty: series.length === 0,
    domain: { min: startHour / 24, max: endHour / 24 },
    ticks: hourTicks(startHour, endHour),
  };
}
