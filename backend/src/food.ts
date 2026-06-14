/**
 * Phase 12: turn a photo of a meal into itemized food candidates with estimated
 * calories + macros (R-CAP-16). Claude vision does the recognition + estimation;
 * the nutrition is an LLM **estimate** (a nutrition-database integration is a later
 * phase — see the roadmap). Candidates are NOT saved: the client confirms/edits the
 * amount (grams / count / serving) — or the calories directly — then persists them
 * as `food` events via `POST /events` (batch), like the other capture flows.
 */
import type { ClaudeClient } from "./claude.ts";

/** Portion unit the model chose for a food (grams, a count of items, or servings). */
export type FoodUnit = "g" | "count" | "serving";

/**
 * One recognised food, with nutrition for its estimated `amount` of `unit`. The
 * client scales calories/macros when the amount changes (per-unit = value / amount).
 */
export interface FoodCandidate {
  item: string;
  unit: FoodUnit;
  amount: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Guessed ingredients, shown for context only — not aggregated (per the design). */
  ingredients: string[];
}

const UNITS: FoodUnit[] = ["g", "count", "serving"];

function nn(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

/** Map the model's JSON ({foods:[...]}) into validated food candidates. */
export function parseFoodCandidates(raw: unknown): FoodCandidate[] {
  const list = isRecord(raw) ? raw.foods : undefined;
  if (!Array.isArray(list)) return [];
  return list
    .filter(isRecord)
    .map((f): FoodCandidate => ({
      item: typeof f.item === "string" ? f.item : "",
      unit: UNITS.includes(f.unit as FoodUnit) ? f.unit as FoodUnit : "serving",
      amount: nn(f.amount) || 1,
      calories: Math.round(nn(f.calories)),
      protein_g: Math.round(nn(f.protein_g)),
      carbs_g: Math.round(nn(f.carbs_g)),
      fat_g: Math.round(nn(f.fat_g)),
      ingredients: Array.isArray(f.ingredients)
        ? f.ingredients.filter((x): x is string => typeof x === "string")
        : [],
    }))
    .filter((f) => f.item !== "");
}

/** Recognise the foods in a meal photo + estimate nutrition (not saved). */
export async function extractFoodFromImage(
  claude: ClaudeClient,
  args: { imageBase64: string; mediaType: string },
): Promise<FoodCandidate[]> {
  const raw = await claude.extractJsonFromImage({
    system: `You identify the foods in a photo of a meal and estimate their nutrition. Return
ONLY JSON: {"foods":[{"item":...,"unit":...,"amount":...,"calories":...,"protein_g":...,"carbs_g":...,"fat_g":...,"ingredients":[...]}]}.
One entry per distinct food on the plate (e.g. steak and eggs are two entries).
- "item": the food name (e.g. "steak", "fried egg", "pizza slice").
- "unit": "g" for foods weighed in grams, "count" for countable items (eggs, slices),
  or "serving" otherwise.
- "amount": your best estimate of the portion shown, in that unit.
- "calories": estimated kcal for THAT amount. "protein_g"/"carbs_g"/"fat_g": grams of
  each macro for that amount. Estimate sensibly; the user will correct them.
- "ingredients": a short list of the food's main components (e.g. pizza → ["dough",
  "tomato","cheese"]) for context.`,
    user: "Identify the foods in this meal photo and estimate calories and macros.",
    imageBase64: args.imageBase64,
    mediaType: args.mediaType,
  });
  return parseFoodCandidates(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
