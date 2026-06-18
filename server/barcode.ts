/**
 * Barcode lookup (ADR-024) — turn a product barcode into a draft item the user
 * reviews then saves, mirroring the label-scan flow (ADR-019). The data source is
 * Open Food Facts (open, free, no API key). The HTTP implementation lives in
 * barcode_off.ts; this file keeps the seam + the pure parsing of an Open Food
 * Facts product into a CreateItem (so it's unit-tested without a network call).
 */
import type { CreateItem } from "../shared/inputs.ts";

export interface ProductLookup {
  /** Resolve a barcode to a draft item, or null if no usable product is found. */
  lookup(barcode: string): Promise<CreateItem | null>;
}

/**
 * Open Food Facts nutriment base-keys we map onto our substance vocabulary. OFF
 * stores these reliably (macros in grams, energy in kcal, sodium in grams — the
 * resolver converts g→mg at log time). Vitamins/minerals are omitted: OFF's units
 * for those are inconsistent and would risk wrong values in a frozen snapshot.
 */
const NUTRIMENT_MAP: { key: string; substance: string; unit: string }[] = [
  { key: "energy-kcal", substance: "calories", unit: "kcal" },
  { key: "proteins", substance: "protein", unit: "g" },
  { key: "carbohydrates", substance: "carbohydrate", unit: "g" },
  { key: "sugars", substance: "sugar", unit: "g" },
  { key: "fat", substance: "fat", unit: "g" },
  { key: "fiber", substance: "fiber", unit: "g" },
  { key: "sodium", substance: "sodium", unit: "g" },
];

/** A finite positive number from a number or numeric string, else undefined. */
function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
}

function firstBrand(brands: unknown): string | undefined {
  if (typeof brands !== "string") return undefined;
  const first = brands.split(",")[0]?.trim();
  return first || undefined;
}

/**
 * Map an Open Food Facts response into an editable CreateItem draft, or null if
 * there's no usable product (unknown barcode / no name and no nutrition).
 *
 * Per-serving values are preferred; if the label only carries per-100 g figures
 * the draft uses a 100 g serving instead. When OFF knows the serving weight, it
 * becomes the item's canonical serving (so it can also be logged by grams).
 */
export function parseOffProduct(raw: unknown, _barcode: string): CreateItem | null {
  const env = (raw && typeof raw === "object") ? raw as Record<string, unknown> : {};
  const product = (env.product && typeof env.product === "object")
    ? env.product as Record<string, unknown>
    : null;
  if (!product) return null;

  const nutr = (product.nutriments && typeof product.nutriments === "object")
    ? product.nutriments as Record<string, unknown>
    : {};

  // Per-serving if any mapped nutrient carries a "_serving" figure; else per-100 g.
  const perServing = NUTRIMENT_MAP.some((m) => num(nutr[`${m.key}_serving`]) !== undefined);
  const suffix = perServing ? "_serving" : "_100g";

  const components = NUTRIMENT_MAP.flatMap((m) => {
    const amount = num(nutr[`${m.key}${suffix}`]);
    return amount === undefined ? [] : [{ substance: m.substance, amount, unit: m.unit }];
  });

  const name = typeof product.product_name === "string" ? product.product_name.trim() : "";
  if (!name && components.length === 0) return null; // nothing usable to save

  const servingGrams = num(product.serving_quantity);
  const defaultServing = perServing
    ? {
      displayQuantity: 1,
      displayUnit: "serving",
      ...(servingGrams !== undefined
        ? { canonicalQuantity: servingGrams, canonicalUnit: "g" }
        : {}),
    }
    : { displayQuantity: 100, displayUnit: "g" };

  return {
    name,
    kind: "product",
    brand: firstBrand(product.brands),
    defaultServing,
    components,
  };
}
