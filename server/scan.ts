/**
 * Label scanning (ADR-019) — turn a photo of a supplement/food label into a draft
 * item the user edits before saving. The Claude-vision implementation lives in
 * scan_anthropic.ts; this file keeps the seam + the pure parsing (so it's
 * unit-tested without the SDK or a network call).
 */
import type { CreateItem } from "../shared/inputs.ts";

export interface ItemScanner {
  scan(args: { imageBase64: string; mediaType: string }): Promise<CreateItem>;
}

export const SCAN_SYSTEM_PROMPT =
  `You read a photo of a food or supplement label and extract it. Return JSON ONLY (no prose):
{"name": string,
 "serving": {"displayQuantity": number, "displayUnit": string},
 "components": [{"substance": string, "amount": number, "unit": "mg"|"g"|"mcg"|"iu"|"ml"|"kcal"}]}.
List EVERY active ingredient / nutrient in the facts panel with its amount PER SERVING and unit.
Use the label's stated serving size (e.g. {"displayQuantity":1,"displayUnit":"scoop"}). Keep
substance names short and lowercase (e.g. "vitamin d", "magnesium", "caffeine", "niacin"). If a
value is unreadable, omit that line rather than guessing.`;

/** Pull the first JSON object out of the model's text (tolerates code fences/prose). */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return {};
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return {};
  }
}

function positive(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Map raw model JSON into an editable CreateItem draft (tolerant — the user fixes it). */
export function parseScannedItem(raw: unknown): CreateItem {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw))
    ? raw as Record<string, unknown>
    : {};

  const s = (o.serving && typeof o.serving === "object")
    ? o.serving as Record<string, unknown>
    : {};
  const components = (Array.isArray(o.components) ? o.components : []).flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const cc = c as Record<string, unknown>;
    const substance = typeof cc.substance === "string" ? cc.substance.trim() : "";
    const amount = positive(cc.amount);
    const unit = typeof cc.unit === "string" ? cc.unit.trim() : "";
    if (!substance || amount === undefined || !unit) return [];
    return [{ substance, amount, unit }];
  });

  return {
    name: typeof o.name === "string" ? o.name.trim() : "",
    kind: "product",
    defaultServing: {
      displayQuantity: positive(s.displayQuantity) ?? 1,
      displayUnit: typeof s.displayUnit === "string" && s.displayUnit.trim()
        ? s.displayUnit.trim()
        : "serving",
    },
    components,
  };
}
