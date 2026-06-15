import { describe, expect, it } from "vitest";
import { DISPLAY_UNITS, unitOptions } from "./units";

describe("unitOptions", () => {
  it("returns the canonical list when no current value is given", () => {
    expect(unitOptions()).toEqual(DISPLAY_UNITS);
    expect(unitOptions("")).toEqual(DISPLAY_UNITS);
  });

  it("does not duplicate a current value already in the list", () => {
    const out = unitOptions("bowl");
    expect(out).toEqual(DISPLAY_UNITS);
    expect(out.filter((u) => u === "bowl")).toHaveLength(1);
  });

  it("prepends an off-list current value so it stays selectable", () => {
    const out = unitOptions("sachet");
    expect(out[0]).toBe("sachet");
    expect(out.slice(1)).toEqual(DISPLAY_UNITS);
  });

  it("trims and ignores whitespace-only current values", () => {
    expect(unitOptions("   ")).toEqual(DISPLAY_UNITS);
  });
});
