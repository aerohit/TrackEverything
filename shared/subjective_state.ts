/**
 * Subjective State (domain 5) — the shared contract.
 *
 * One Zod source of truth for the check-in shape, imported by the Hono API
 * (server/, Deno) and the SvelteKit PWA (web/, Vite). See ADR-016 + ADR-017.
 *
 * Model (ADR-017): each reading is **one immutable row** — a `kind` (which
 * subjective state) + a 1–5 `rating`, stamped `recorded_at`. New subjective
 * states are added by extending `SUBJECTIVE_KINDS` (+ the DB enum) — no new
 * columns. A "check-in" rating several states at once is just several readings
 * recorded together (a batch POST sharing one `recorded_at`).
 *
 * Cross-runtime note: the bare `zod` import resolves via the root deno.json import
 * map on the server and via web/node_modules in Vite — so this file is shared as-is.
 */
import { z } from "zod";

/** The subjective states tracked so far. Extend here (+ the DB enum) to add more. */
export const SUBJECTIVE_KINDS = ["mood", "energy", "focus"] as const;
export type SubjectiveKind = (typeof SUBJECTIVE_KINDS)[number];

export const kindSchema = z.enum(SUBJECTIVE_KINDS);
/** A rating is an integer 1–5. */
export const ratingSchema = z.number().int().min(1).max(5);

/** One reading within a check-in. */
export const readingSchema = z.object({
  kind: kindSchema,
  rating: ratingSchema,
});
export type Reading = z.infer<typeof readingSchema>;

/**
 * Payload to record a check-in: one or more readings (a snapshot), with an
 * optional shared note. At least one reading; no kind repeated in one check-in.
 */
export const createCheckinSchema = z.object({
  readings: z
    .array(readingSchema)
    .min(1, "Rate at least one subjective state.")
    .refine(
      (rs) => new Set(rs.map((r) => r.kind)).size === rs.length,
      "Each subjective state can appear at most once per check-in.",
    ),
  note: z.string().trim().max(2000).optional(),
});
export type CreateCheckin = z.infer<typeof createCheckinSchema>;

/**
 * A stored reading as returned by the API. Immutable — there is no update or
 * delete (ADR-017), so `recordedAt` is the only timestamp.
 */
export const checkinSchema = z.object({
  id: z.string().uuid(),
  kind: kindSchema,
  rating: ratingSchema,
  note: z.string().nullable(),
  recordedAt: z.string().datetime({ offset: true }),
});
export type Checkin = z.infer<typeof checkinSchema>;
