/**
 * Controlled vocabularies for the event log — the code-side source of truth that
 * the data dictionary ([docs/data-dictionary.md](../docs/data-dictionary.md))
 * documents in prose. Kept deliberately small and open: categories and sources
 * are validated in the app layer (not by DB constraints) so adding one is a code
 * change, not a migration (per ADR-006).
 */

export const CATEGORIES = [
  "food",
  "drink",
  "supplement",
  "sleep",
  "workout",
  "breathwork",
  "mood",
  "energy",
  "focus",
  "stressor",
  "hydration",
  "note",
] as const;
export type Category = typeof CATEGORIES[number];

export const SOURCES = ["voice", "manual", "quicklog", "whoop", "photo"] as const;
export type Source = typeof SOURCES[number];

export const OCCURRED_AT_CONFIDENCE = ["high", "inferred"] as const;
export type OccurredAtConfidence = typeof OCCURRED_AT_CONFIDENCE[number];

export function isKnownCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function isKnownSource(value: string): value is Source {
  return (SOURCES as readonly string[]).includes(value);
}

export function isKnownConfidence(value: string): value is OccurredAtConfidence {
  return (OCCURRED_AT_CONFIDENCE as readonly string[]).includes(value);
}
