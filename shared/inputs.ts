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

export const INPUT_KINDS = ["product", "recipe", "simple", "stack"] as const;
export type InputKind = (typeof INPUT_KINDS)[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low", "unknown"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/** How an intake was captured (provenance, R-CAP-12). */
export const INTAKE_SOURCES = ["quick", "recent", "photo", "voice", "manual", "api"] as const;
export type IntakeSource = (typeof INTAKE_SOURCES)[number];
export const intakeSourceSchema = z.enum(INTAKE_SOURCES);

/** How exact an intake is — a measured/known log vs an estimated portion (R-CAP-25). */
export const INTAKE_PRECISIONS = ["precise", "rough"] as const;
export type IntakePrecision = (typeof INTAKE_PRECISIONS)[number];
export const intakePrecisionSchema = z.enum(INTAKE_PRECISIONS);

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

/** A quick-log amount preset for a favorite (e.g. Water "500 ml" → 500 ml). */
export const quickPresetSchema = z.object({
  label: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
});
export type QuickPreset = z.infer<typeof quickPresetSchema>;

/** Pin/unpin an item as a Quick Capture favorite, with ordering + amount presets. */
export const setQuickLogSchema = z.object({
  quickLog: z.boolean(),
  quickOrder: z.number().int().nonnegative().nullish(),
  presets: z.array(quickPresetSchema).max(8).optional(),
});
export type SetQuickLog = z.infer<typeof setQuickLogSchema>;

export const createItemSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(INPUT_KINDS),
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
  // How this was captured (provenance, R-CAP-12); defaults to "manual" server-side.
  source: intakeSourceSchema.optional(),
  // How exact it is (R-CAP-25); defaults from source server-side (photo/voice → rough).
  precision: intakePrecisionSchema.optional(),
  // An occasional item logged by name with no matching item/nutrition (R-CAP-30).
  unresolved: z.boolean().optional(),
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

/** Request to scan a label photo into a draft item (POST /api/items/scan). */
export const scanRequestSchema = z.object({
  imageBase64: z.string().min(1),
  mediaType: z.string().regex(/^image\/(jpeg|png|webp|heic|heif|gif)$/, "unsupported image type"),
});
export type ScanRequest = z.infer<typeof scanRequestSchema>;

/**
 * Look up a product barcode (EAN-8/UPC-A/EAN-13) against an open food database,
 * returning a draft item the user reviews then saves (POST /api/items/barcode).
 */
export const barcodeLookupRequestSchema = z.object({
  barcode: z.string().regex(/^\d{8,14}$/, "barcode must be 8-14 digits"),
});
export type BarcodeLookupRequest = z.infer<typeof barcodeLookupRequestSchema>;

/**
 * Recognize an intake from a meal photo or a spoken/typed phrase, then match the
 * catalog (POST /api/intake/recognize). Exactly one source is supplied. Voice is
 * transcribed on-device (Web Speech API) and arrives here as `text` (ADR-020).
 */
export const recognizeRequestSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("photo"),
    imageBase64: z.string().min(1),
    mediaType: z.string().regex(/^image\/(jpeg|png|webp|heic|heif|gif)$/, "unsupported image type"),
    // Client's current local time ("YYYY-MM-DDTHH:MM"), to resolve any spoken time.
    now: z.string().optional(),
  }),
  z.object({ source: z.literal("text"), text: z.string().min(1), now: z.string().optional() }),
]);
export type RecognizeRequest = z.infer<typeof recognizeRequestSchema>;

// ---- read DTOs ----

/**
 * What the recognizer extracted from a photo/phrase: a human-level guess (name +
 * quantity + unit + type) and a full draft item to persist if saved as new.
 */
export interface RecognizedIntake {
  name: string;
  quantity: number;
  unit: string;
  draft: CreateItem;
  /** A time the user stated ("at 10am", "an hour ago"), as a local "YYYY-MM-DDTHH:MM"; else absent. */
  when?: string;
}

/** Recognition + catalog match returned by POST /api/intake/recognize. */
export interface RecognizeResult {
  recognized: RecognizedIntake;
  matches: InputItemSummary[];
  transcript?: string;
}

/** One distinct recently-logged item, for quick re-logging (GET /api/intake/recent-items). */
export interface RecentItem {
  itemId: string | null;
  displayName: string;
  quantity: number;
  unit: string;
  lastLoggedAt: string;
}

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
  source: IntakeSource;
  precision: IntakePrecision;
  /** An occasional item with no matching item/nutrition yet — resolvable on the Overview (R-CAP-30). */
  unresolved: boolean;
  resolved: ResolvedAmount[];
  /** When this event logged a **stack** as a single entry: its member items (else empty). */
  stackItems: StackChild[];
}

/** An item logged often enough to suggest pinning to Quick Capture (v2-C0). */
export interface FavoriteSuggestion extends InputItemSummary {
  count: number;
}

/** One substance's total across a day (canonical unit). */
export interface DailyTotal {
  substance: string;
  substanceType: SubstanceType;
  amount: number;
  unit: SubstanceUnit;
}

export interface InputItemSummary {
  id: string;
  name: string;
  kind: InputKind;
  brand: string | null;
  defaultDisplayQuantity: number | null;
  defaultDisplayUnit: string | null;
  defaultCanonicalQuantity: number | null;
  defaultCanonicalUnit: string | null;
}

export interface ItemComponentDTO {
  substance: string | null;
  childItemId: string | null;
  amount: number;
  unit: string;
  position: number;
  prepState: string | null;
}

export interface InputItemDetail extends InputItemSummary {
  notes: string | null;
  version: number;
  components: ItemComponentDTO[];
  quickLog: boolean;
  quickOrder: number | null;
  quickPresets: QuickPreset[];
}

/** A member item of a stack (a recipe favorite's child item), for the log checklist. */
export interface StackChild {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
}

/** A pinned Quick Capture favorite: an item summary + presets + (for stacks) its members. */
export interface QuickItem extends InputItemSummary {
  quickOrder: number | null;
  quickPresets: QuickPreset[];
  /** Child items, when this favorite is a stack (recipe of items); empty otherwise. */
  stack: StackChild[];
}
