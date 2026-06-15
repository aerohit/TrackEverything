import { describe, expect, it } from "vitest";
import { buildDayChart } from "./chart";
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
});
