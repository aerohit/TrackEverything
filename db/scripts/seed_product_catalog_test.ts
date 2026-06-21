import { assertEquals } from "@std/assert";
import { servingForRow } from "./seed_product_catalog.ts";

Deno.test("servingForRow: per-100 item keeps its serving, scale 1", () => {
  const s = servingForRow({
    display_qty: "100",
    display_unit: "g",
    canonical_qty: "100",
    canonical_unit: "g",
    piece_unit: "",
    piece_grams: "",
  });
  assertEquals(s, {
    displayQuantity: 100,
    displayUnit: "g",
    canonicalQuantity: 100,
    canonicalUnit: "g",
    scale: 1,
  });
});

Deno.test("servingForRow: piece item gets a '1 piece' serving + per-piece scale", () => {
  // Banana: per 100 g, one piece = 120 g.
  const s = servingForRow({
    display_qty: "100",
    display_unit: "g",
    canonical_qty: "100",
    canonical_unit: "g",
    piece_unit: "piece",
    piece_grams: "120",
  });
  assertEquals(s, {
    displayQuantity: 1,
    displayUnit: "piece",
    canonicalQuantity: 120,
    canonicalUnit: "g",
    scale: 1.2,
  });
  // A per-100 nutrient (Energy 89) becomes per-piece: 89 * 1.2 = 106.8.
  assertEquals(Math.round(89 * s.scale * 1000) / 1000, 106.8);
});

Deno.test("servingForRow: a custom piece unit (clove) is honoured", () => {
  const s = servingForRow({
    canonical_qty: "100",
    canonical_unit: "g",
    piece_unit: "clove",
    piece_grams: "3",
  });
  assertEquals(s.displayUnit, "clove");
  assertEquals(s.canonicalQuantity, 3);
  assertEquals(s.scale, 0.03);
});
