/**
 * Intake recognition (ADR-020) — turn a meal photo or a spoken/typed phrase into a
 * human-level intake guess (name + quantity + unit) plus a full draft item that can be
 * saved as new. The Claude implementation lives in recognize_anthropic.ts; this file
 * keeps the seam + the pure parsing so it's unit-tested without the SDK or a network call.
 */
import type { CreateItem, InputPrimaryType, RecognizedIntake } from "../shared/inputs.ts";

/** Either a photo to look at, or a phrase (typed or transcribed) to read. */
export type RecognizeInput =
  | { kind: "photo"; imageBase64: string; mediaType: string; now?: string }
  | { kind: "text"; text: string; now?: string };

export interface IntakeRecognizer {
  recognize(input: RecognizeInput): Promise<RecognizedIntake>;
}

export const RECOGNIZE_SYSTEM_PROMPT =
  `You identify ONE thing a person consumed — from a photo of food/drink, or a short phrase
they spoke or typed (e.g. "two cups of coffee", "a bowl of oatmeal with banana"). Return JSON
ONLY (no prose):
{"name": string, "primaryType": "food"|"drink"|"supplement"|"medication"|"meal"|"other",
 "quantity": number, "unit": string, "when": string|null,
 "components": [{"substance": string, "amount": number, "unit": "mg"|"g"|"mcg"|"iu"|"ml"|"kcal"}]}.
"name" is a short, human, lowercase-ish label ("banana", "chicken salad", "latte"). "quantity"
and "unit" are how much was consumed in display terms ("1" + "bowl", "2" + "cup", "1" + "serving").
"when": if the user states a time ("at 10am", "an hour ago", "this morning", "yesterday at 8"),
resolve it against the provided current local time and return a local wall-clock timestamp
"YYYY-MM-DDTHH:MM"; otherwise return null. Don't invent a time.
"components" estimates the nutrition of ONE unit: use "kcal" for energy and "g" for protein,
carbohydrate, fat, fiber, sugar; include caffeine/alcohol/sodium where relevant. Keep substance
names short and lowercase ("calories", "protein", "carbohydrate", "fat", "caffeine"). Omit a
component rather than guessing wildly; if you cannot tell what it is, return an empty components list.`;

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

const PRIMARY_TYPES = ["food", "drink", "supplement", "medication", "meal", "other"];

function positive(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/** Map raw model JSON into a recognized intake + an editable draft item (tolerant). */
export function parseRecognized(raw: unknown): RecognizedIntake {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw))
    ? raw as Record<string, unknown>
    : {};
  const primaryType: InputPrimaryType = PRIMARY_TYPES.includes(o.primaryType as string)
    ? o.primaryType as InputPrimaryType
    : "food";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  const quantity = positive(o.quantity) ?? 1;
  const unit = typeof o.unit === "string" && o.unit.trim() ? o.unit.trim() : "serving";
  // A local wall-clock "YYYY-MM-DDTHH:MM" the model resolved from a stated time, else absent.
  const when = typeof o.when === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(o.when.trim())
    ? o.when.trim()
    : undefined;

  const components = (Array.isArray(o.components) ? o.components : []).flatMap((c) => {
    if (!c || typeof c !== "object") return [];
    const cc = c as Record<string, unknown>;
    const substance = typeof cc.substance === "string" ? cc.substance.trim() : "";
    const amount = positive(cc.amount);
    const u = typeof cc.unit === "string" ? cc.unit.trim() : "";
    if (!substance || amount === undefined || !u) return [];
    return [{ substance, amount, unit: u }];
  });

  const draft: CreateItem = {
    name,
    // Recognized intakes are whole foods/meals/drinks, not packaged products with a
    // facts panel — model them as a single "simple" item carrying estimated nutrients.
    kind: "simple",
    primaryType,
    roles: [],
    defaultServing: { displayQuantity: 1, displayUnit: unit },
    components,
  };

  return { name, quantity, unit, primaryType, draft, when };
}
