import { describe, expect, it } from "vitest";
import { iconForInput } from "./icons";

describe("iconForInput", () => {
  it("maps common inputs to sensible emojis", () => {
    expect(iconForInput("Morning coffee")).toBe("☕");
    expect(iconForInput("Pre-workout")).toBe("⚡");
    expect(iconForInput("Chicken salad")).toBe("🥗");
    expect(iconForInput("Pizza")).toBe("🍕");
    expect(iconForInput("Beer")).toBe("🍺");
    expect(iconForInput("Magnesium")).toBe("💊");
  });

  it("prefers the more specific rule (supplements beat the food they contain)", () => {
    expect(iconForInput("Fish oil")).toBe("💊"); // not 🐟
    expect(iconForInput("Salmon dinner")).toBe("🐟"); // plain fish still maps to fish
    expect(iconForInput("Protein bar")).toBe("🍫"); // not the 🥛 protein-shake rule
    expect(iconForInput("Protein shake")).toBe("🥛");
  });

  it("falls back to a plate for unknown inputs", () => {
    expect(iconForInput("Something unusual")).toBe("🍽️");
  });
});
