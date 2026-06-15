/**
 * Subjective State (domain 5) — the shared contract.
 *
 * One Zod source of truth for the check-in shape, imported by the Hono API
 * (server/, Deno) and the SvelteKit PWA (web/, Vite) — and reusable to validate
 * any future LLM-extracted check-ins. See ADR-016 + ARCHITECTURE §4b.
 *
 * The first build tracks only mood / energy / focus; the other five dimensions
 * (stress, confidence, motivation, calmness, playfulness) are additive later.
 *
 * Cross-runtime note: the bare `zod` import resolves via the root deno.json import
 * map on the server and via web/node_modules in Vite — so this file is shared as-is.
 */
import { z } from "zod";

/** The subjective dimensions tracked in this phase. */
export const DIMENSIONS = ["mood", "energy", "focus"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

/** A single dimension rating: an integer 1–5, or null/omitted if not rated. */
const rating = z.number().int().min(1).max(5);

/**
 * Payload to create a check-in. A check-in is a snapshot: rate any subset of the
 * dimensions; at least one is required so we never store an empty row.
 */
export const createCheckinSchema = z
  .object({
    mood: rating.nullish(),
    energy: rating.nullish(),
    focus: rating.nullish(),
    note: z.string().trim().max(2000).nullish(),
    // When you felt this. Defaults to now (server-side) when omitted.
    occurredAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((v) => DIMENSIONS.some((d) => v[d] != null), {
    message: "Rate at least one of mood, energy, or focus.",
  });

export type CreateCheckin = z.infer<typeof createCheckinSchema>;

/** Patch an existing check-in. Any provided dimension/note is updated; null clears it. */
export const updateCheckinSchema = z
  .object({
    mood: rating.nullish(),
    energy: rating.nullish(),
    focus: rating.nullish(),
    note: z.string().trim().max(2000).nullish(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update." });

export type UpdateCheckin = z.infer<typeof updateCheckinSchema>;

/** A stored check-in as returned by the API (timestamps are ISO strings over the wire). */
export const checkinSchema = z.object({
  id: z.string().uuid(),
  mood: rating.nullable(),
  energy: rating.nullable(),
  focus: rating.nullable(),
  note: z.string().nullable(),
  occurredAt: z.string().datetime({ offset: true }),
  recordedAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type Checkin = z.infer<typeof checkinSchema>;
