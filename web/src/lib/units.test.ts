import { describe, expect, it } from "vitest";
import {
  DISPLAY_UNITS,
  measureUnitOptions,
  SERVING_MEASURE_UNITS,
  substanceUnitOptions,
  SUBSTANCE_UNITS,
  unitOptions,
} from "./units";

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

describe("substanceUnitOptions", () => {
  it("offers the canonical analytical units", () => {
    expect(substanceUnitOptions()).toEqual(SUBSTANCE_UNITS);
    expect(SUBSTANCE_UNITS).toEqual(["g", "mg", "mcg", "ml", "kcal", "iu"]);
  });

  it("keeps an off-list current value selectable without duplicating an on-list one", () => {
    expect(substanceUnitOptions("billion-iu")[0]).toBe("billion-iu");
    expect(substanceUnitOptions("mg")).toEqual(SUBSTANCE_UNITS);
  });
});

describe("measureUnitOptions", () => {
  it("offers only mass/volume units the resolver can convert", () => {
    expect(measureUnitOptions()).toEqual(SERVING_MEASURE_UNITS);
    expect(SERVING_MEASURE_UNITS).toEqual(["g", "mg", "mcg", "ml", "l"]);
    expect(SERVING_MEASURE_UNITS).not.toContain("kcal"); // energy isn't a serving measure
  });

  it("keeps an off-list current value (e.g. a scanned 'oz') selectable", () => {
    expect(measureUnitOptions("oz")[0]).toBe("oz");
  });
});
