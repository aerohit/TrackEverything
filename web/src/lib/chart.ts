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
  const series: Series[] = [];
  for (const k of kinds) {
    const pts = (byKind.get(k) ?? []).slice().sort((a, b) => a.x - b.x);
    if (pts.length) series.push({ kind: k, points: pts });
  }
  return { series, empty: series.length === 0 };
}
