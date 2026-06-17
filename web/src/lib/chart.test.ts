import { describe, expect, it } from "vitest";
import { buildDayChart, seriesOffset } from "./chart";
import type { Checkin, SubjectiveKind } from "$lib/types";

const KINDS: SubjectiveKind[] = ["mood", "energy", "focus"];

function ci(kind: SubjectiveKind, rating: number, hour: number): Checkin {
  return {
    id: crypto.randomUUID(),
    kind,
    rating,
    note: null,
    recordedAt: new Date(2026, 5, 15, hour, 0, 0).toISOString(),
  };
}

describe("buildDayChart", () => {
  it("groups points by kind, sorted by time of day", () => {
    const chart = buildDayChart([ci("mood", 4, 9), ci("mood", 2, 7), ci("energy", 5, 8)], KINDS);
    expect(chart.empty).toBe(false);
    const mood = chart.series.find((s) => s.kind === "mood");
    expect(mood?.points.map((p) => p.y)).toEqual([2, 4]); // 7h before 9h
    // A kind with no readings is omitted entirely.
    expect(chart.series.find((s) => s.kind === "focus")).toBeUndefined();
  });

  it("is empty when there are no readings", () => {
    expect(buildDayChart([], KINDS).empty).toBe(true);
  });

  it("defaults the visible window to the waking hours (08:00–22:00) with sensible ticks", () => {
    const chart = buildDayChart([ci("mood", 4, 9), ci("energy", 3, 20)], KINDS);
    expect(chart.domain).toEqual({ min: 8 / 24, max: 22 / 24 });
    expect(chart.ticks).toEqual([8, 12, 16, 20, 22]);
  });

  it("widens the window to whole hours around an out-of-window outlier (never clipped)", () => {
    // A 06:30 reading pulls the start back to 06:00; a 23:15 one pushes the end to 24:00.
    const chart = buildDayChart(
      [ci("mood", 2, 9), { ...ci("energy", 5, 6), recordedAt: new Date(2026, 5, 15, 6, 30).toISOString() }, {
        ...ci("focus", 1, 23),
        recordedAt: new Date(2026, 5, 15, 23, 15).toISOString(),
      }],
      KINDS,
    );
    expect(chart.domain.min).toBeCloseTo(6 / 24);
    expect(chart.domain.max).toBeCloseTo(24 / 24);
    expect(chart.ticks).toEqual([6, 8, 12, 16, 20, 24]); // ends + interior multiples of 4
  });
});

describe("seriesOffset", () => {
  it("fans 3 series symmetrically around 0", () => {
    expect(seriesOffset(0, 3)).toBeCloseTo(-3.5);
    expect(seriesOffset(1, 3)).toBe(0);
    expect(seriesOffset(2, 3)).toBeCloseTo(3.5);
    // Offsets cancel out, so the cluster stays centered on its value.
    const sum = [0, 1, 2].reduce((a, i) => a + seriesOffset(i, 3), 0);
    expect(sum).toBeCloseTo(0);
  });

  it("returns 0 for a single series and respects a custom separation", () => {
    expect(seriesOffset(0, 1)).toBe(0);
    expect(seriesOffset(2, 3, 5)).toBeCloseTo(5);
  });
});
