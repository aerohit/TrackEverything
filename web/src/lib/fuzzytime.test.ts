import { describe, expect, it } from "vitest";
import { FUZZY_TIMES, fuzzyWhen } from "./fuzzytime";

describe("fuzzyWhen", () => {
  const now = new Date(2026, 5, 18, 21, 47); // 2026-06-18 21:47 local

  it("maps a bucket to that hour today (datetime-local format)", () => {
    const morning = FUZZY_TIMES.find((b) => b.label === "Morning")!;
    expect(fuzzyWhen(morning, now)).toBe("2026-06-18T08:00");
    const noon = FUZZY_TIMES.find((b) => b.label === "Noon")!;
    expect(fuzzyWhen(noon, now)).toBe("2026-06-18T12:30");
  });

  it("zero-pads month/day/hour/minute", () => {
    const evening = FUZZY_TIMES.find((b) => b.label === "Evening")!;
    expect(fuzzyWhen(evening, new Date(2026, 0, 5, 10, 0))).toBe("2026-01-05T19:00");
  });
});
