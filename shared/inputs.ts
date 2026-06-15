/**
 * Inputs domain (v2-2, ADR-018) — the shared contract.
 *
 * "Input = anything intentionally put into the body." Two layers:
 *   - human-level log: `intake_event` → `input_item`
 *   - analytical decomposition: `item_component` → `substance`, frozen per event
 *     as `resolved_amount` (the snapshot that powers daily totals).
 *
 * One Zod source of truth, shared by the API, the client, and resolution. Elemental
 * substances only for now (compound→elemental conversion is deferred).
 */
import { z } from "zod";

export const SUBSTANCE_TYPES = [
  "macronutrient",
  "mineral",
  "electrolyte",
  "vitamin",
  "stimulant",
  "supplement_compound",
  "psychoactive",
  "medication",
  "energy",
  "water",
  "other",
] as const;
export type SubstanceType = (typeof SUBSTANCE_TYPES)[number];

/** Canonical (analysable) units. Display units (scoop, bowl, tablet…) are free text. */
export const SUBSTANCE_UNITS = ["g", "mg", "mcg", "ml", "kcal", "iu"] as const;
export type SubstanceUnit = (typeof SUBSTANCE_UNITS)[number];

export const INPUT_KINDS = ["product", "recipe", "simple"] as const;
export type InputKind = (typeof INPUT_KINDS)[number];

export const INPUT_PRIMARY_TYPES = [
  "food",
  "drink",
  "supplement",
  "medication",
  "meal",
  "other",
] as const;
export type InputPrimaryType = (typeof INPUT_PRIMARY_TYPES)[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low", "unknown"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const substanceUnitSchema = z.enum(SUBSTANCE_UNITS);
export const confidenceSchema = z.enum(CONFIDENCE_LEVELS);

// ---- creating reusable items (products / recipes / simple foods) ----

/** A component is exactly one of: a substance (by name) or a child item (by id). */
export const componentInputSchema = z
  .object({
    substance: z.string().min(1).optional(),
    childItemId: z.string().uuid().optional(),
    amount: z.number().positive(),
    unit: z.string().min(1),
    position: z.number().int().nonnegative().optional(),
    prepState: z.string().optional(),
  })
  .refine(
    (c) => (c.substance != null) !== (c.childItemId != null),
    "Each component must be exactly one of a substance or a child item.",
  );
export type ComponentInput = z.infer<typeof componentInputSchema>;

export const servingSchema = z.object({
  displayQuantity: z.number().positive().optional(),
  displayUnit: z.string().optional(),
  canonicalQuantity: z.number().positive().optional(),
  canonicalUnit: z.string().optional(),
});

export const createItemSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(INPUT_KINDS),
  primaryType: z.enum(INPUT_PRIMARY_TYPES),
  roles: z.array(z.string()).optional(),
  brand: z.string().optional(),
  defaultServing: servingSchema.optional(),
  notes: z.string().optional(),
  components: z.array(componentInputSchema).optional(),
});
export type CreateItem = z.infer<typeof createItemSchema>;

// ---- logging an intake ----

/** Manual substance amounts for a freeform log (no item, or to override resolution). */
export const manualResolvedSchema = z.object({
  substance: z.string().min(1),
  amount: z.number().nonnegative(),
  unit: substanceUnitSchema,
  confidence: confidenceSchema.optional(),
});
export type ManualResolved = z.infer<typeof manualResolvedSchema>;

export const createIntakeEventSchema = z.object({
  occurredAt: z.string().datetime({ offset: true }).optional(),
  displayName: z.string().min(1),
  itemId: z.string().uuid().optional(),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  confidence: confidenceSchema.optional(),
  contextTags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  // Freeform logs (no item) can attach known substance amounts directly.
  resolved: z.array(manualResolvedSchema).optional(),
});
export type CreateIntakeEvent = z.infer<typeof createIntakeEventSchema>;

/** A patch for an existing intake event (mutable — ADR-018). Any provided field updates. */
export const updateIntakeEventSchema = createIntakeEventSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  "Nothing to update.",
);
export type UpdateIntakeEvent = z.infer<typeof updateIntakeEventSchema>;

// ---- read DTOs ----

export interface Substance {
  id: string;
  name: string;
  substanceType: SubstanceType;
  canonicalUnit: SubstanceUnit;
  aliases: string[];
}

export interface ResolvedAmount {
  substance: string;
  amount: number;
  unit: SubstanceUnit;
  confidence: Confidence;
  source: string;
}

export interface IntakeEvent {
  id: string;
  occurredAt: string;
  displayName: string;
  itemId: string | null;
  quantity: number;
  unit: string;
  canonicalQuantity: number | null;
  canonicalUnit: string | null;
  confidence: Confidence;
  contextTags: string[];
  notes: string | null;
  resolved: ResolvedAmount[];
}

/** One substance's total across a day (canonical unit). */
export interface DailyTotal {
  substance: string;
  amount: number;
  unit: SubstanceUnit;
}
