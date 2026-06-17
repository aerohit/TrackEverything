import { describe, expect, it } from "vitest";
import { suggestionPayload, timeSuggestions } from "./suggest";
import type { IntakeEvent } from "$lib/types";

// Minimal IntakeEvent at a given local time, newest-first responsibility on the caller.
function ev(itemId: string | null, name: string, iso: string, qty = 1, unit = "cup"): IntakeEvent {
  return {
    id: crypto.randomUUID(),
    occurredAt: iso,
    displayName: name,
    itemId,
    quantity: qty,
    unit,
    canonicalQuantity: null,
    canonicalUnit: null,
    confidence: "medium",
    contextTags: [],
    notes: null,
    source: "quick",
    precision: "precise",
    resolved: [],
    stackItems: [],
  };
}

// "now" = 2026-06-18 08:30 local.
const NOW = new Date(2026, 5, 18, 8, 30);
const at = (day: number, hour: number, min = 0) => new Date(2026, 5, day, hour, min).toISOString();

describe("timeSuggestions", () => {
  it("suggests items usually logged around this hour, most-frequent first", () => {
    const events = [
      ev("coffee", "Coffee", at(17, 8, 10)), // 3 mornings of coffee ~08:00
      ev("coffee", "Coffee", at(16, 8, 5)),
      ev("coffee", "Coffee", at(15, 7, 50)),
      ev("vd", "Vitamin D", at(17, 8, 15)), // 2 mornings of vitamin D
      ev("vd", "Vitamin D", at(16, 8, 20)),
      ev("beer", "Beer", at(17, 20, 0)), // evening → out of window
      ev("beer", "Beer", at(16, 20, 0)),
    ];
    const out = timeSuggestions(events, NOW);
    expect(out.map((s) => s.displayName)).toEqual(["Coffee", "Vitamin D"]);
    expect(out[0].count).toBe(3);
  });

  it("excludes items already logged today and needs >= minCount", () => {
    const events = [
      ev("coffee", "Coffee", at(18, 8, 5)), // already logged today (June 18)
      ev("coffee", "Coffee", at(17, 8, 0)),
      ev("coffee", "Coffee", at(16, 8, 0)),
      ev("tea", "Tea", at(17, 8, 0)), // only 1 prior → below minCount(2)
    ];
    expect(timeSuggestions(events, NOW)).toEqual([]);
  });

  it("ignores freeform logs (no itemId)", () => {
    const events = [ev(null, "Mystery", at(17, 8, 0)), ev(null, "Mystery", at(16, 8, 0))];
    expect(timeSuggestions(events, NOW)).toEqual([]);
  });
});

describe("suggestionPayload", () => {
  it("logs the item at its usual amount as a quick capture", () => {
    const s = { itemId: "coffee", displayName: "Coffee", quantity: 1, unit: "mug", count: 4 };
    expect(suggestionPayload(s)).toEqual({
      displayName: "Coffee",
      itemId: "coffee",
      quantity: 1,
      unit: "mug",
      source: "quick",
    });
  });
});
