/**
 * Phase 5: subjective check-ins. A check-in is one or more of mood/energy/focus
 * rated 1–5 — the outcome variables the analysis phases correlate against
 * (R-SUBJ-1). Each rating becomes an ordinary event (category mood/energy/focus,
 * `fields.rating`), so nothing downstream special-cases them.
 *
 * `validateCheckin` and `buildCheckinEvents` are pure (unit-tested).
 */
import type { NewEvent } from "./events.ts";

export const CHECKIN_DIMENSIONS = ["mood", "energy", "focus"] as const;
export type CheckinDimension = typeof CHECKIN_DIMENSIONS[number];

export const RATING_MIN = 1;
export const RATING_MAX = 5;

export interface NewCheckin {
  mood?: number;
  energy?: number;
  focus?: number;
  occurredAt?: Date | string;
  note?: string | null;
}

/** Validate a check-in; returns human-readable errors (empty = valid). */
export function validateCheckin(input: NewCheckin): string[] {
  const errors: string[] = [];
  const provided = CHECKIN_DIMENSIONS.filter((d) => input[d] !== undefined);

  if (provided.length === 0) {
    errors.push("at least one of mood, energy, focus is required");
  }
  for (const dim of provided) {
    const value = input[dim];
    if (
      !Number.isInteger(value) || (value as number) < RATING_MIN || (value as number) > RATING_MAX
    ) {
      errors.push(`${dim} must be an integer ${RATING_MIN}–${RATING_MAX}`);
    }
  }
  if (input.occurredAt !== undefined && !isValidDate(input.occurredAt)) {
    errors.push("occurredAt must be a valid date/time when provided");
  }
  return errors;
}

/** Turn a check-in into one event per provided rating. */
export function buildCheckinEvents(input: NewCheckin, now: Date): NewEvent[] {
  const occurredAt = input.occurredAt ?? now;
  return CHECKIN_DIMENSIONS
    .filter((dim) => input[dim] !== undefined)
    .map((dim) => ({
      category: dim,
      occurredAt,
      occurredAtConfidence: "high" as const,
      source: "manual",
      fields: { rating: input[dim] as number },
      rawText: input.note ?? null,
    }));
}

function isValidDate(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === "string") return !Number.isNaN(new Date(value).getTime());
  return false;
}
