import { describe, expect, it } from "vitest";
import { type Match, selectedName } from "./log";

const results: Match[] = [
  { id: "a1", name: "Dope-Max Pre-Workout", kind: "product" },
  { id: "b2", name: "Greek Yogurt", kind: "simple" },
];

describe("selectedName", () => {
  it("uses the matched item's name, not the transcribed text", () => {
    expect(selectedName("item:a1", results, "pre workout")).toBe("Dope-Max Pre-Workout");
    expect(selectedName("item:b2", results, "yoghurt")).toBe("Greek Yogurt");
  });

  it("keeps the recognized fallback for 'save as new' and freeform", () => {
    expect(selectedName("new", results, "pre workout")).toBe("pre workout");
    expect(selectedName("freeform", results, "pre workout")).toBe("pre workout");
  });

  it("falls back when the selected item is no longer in the results", () => {
    expect(selectedName("item:gone", results, "pre workout")).toBe("pre workout");
  });
});
