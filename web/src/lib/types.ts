/**
 * Client-side mirror of the server's Subjective State contract
 * (../../shared/subjective_state.ts). The shared Zod schema remains the runtime
 * source of truth — the server validates every request against it — so this is
 * a thin type-only copy that keeps the web build inside the Node/Vite world
 * (no cross-boundary import of the Deno/zod module). Keep the two in sync.
 */
export const SUBJECTIVE_KINDS = ["mood", "energy", "focus"] as const;
export type SubjectiveKind = (typeof SUBJECTIVE_KINDS)[number];

export interface Reading {
  kind: SubjectiveKind;
  rating: number;
}

export interface CreateCheckin {
  readings: Reading[];
  note?: string;
}

export interface Checkin {
  id: string;
  kind: SubjectiveKind;
  rating: number;
  note: string | null;
  recordedAt: string;
}

// ---- Inputs domain (mirrors ../../shared/inputs.ts; server is authoritative) ----

export type SubstanceUnit = "g" | "mg" | "mcg" | "ml" | "kcal" | "iu";
export type Confidence = "high" | "medium" | "low" | "unknown";

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
  contextTags: string[];
  source: IntakeSource;
  precision: IntakePrecision;
  /** An occasional item with no matching item/nutrition yet — resolvable on the Overview. */
  unresolved: boolean;
  resolved: ResolvedAmount[];
  /** When this event logged a stack as a single entry: its member items (else empty). */
  stackItems: StackChild[];
}

export interface DailyTotal {
  substance: string;
  substanceType: string;
  amount: number;
  unit: SubstanceUnit;
}

export interface InputItemSummary {
  id: string;
  name: string;
  kind: "product" | "recipe" | "simple" | "stack";
  defaultDisplayQuantity: number | null;
  defaultDisplayUnit: string | null;
  defaultCanonicalQuantity: number | null;
  defaultCanonicalUnit: string | null;
}

/** One component of an item — exactly one of `substance` (by name) or `childItemId`. */
export interface ItemComponentDTO {
  substance: string | null;
  childItemId: string | null;
  amount: number;
  unit: string;
  position: number;
}

/** An item plus its components (GET /api/items/:id). */
export interface InputItemDetail extends InputItemSummary {
  components: ItemComponentDTO[];
  quickLog: boolean;
  quickOrder: number | null;
  quickPresets: QuickPreset[];
}

/** A one-tap amount preset for a Quick Capture favorite (mirrors shared/inputs.ts). */
export interface QuickPreset {
  label: string;
  quantity: number;
  unit: string;
}

/** A member item of a stack (a recipe favorite's child item). */
export interface StackChild {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
}

/** A pinned Quick Capture favorite: an item summary + presets + (for stacks) members. */
export interface QuickItem extends InputItemSummary {
  quickOrder: number | null;
  quickPresets: QuickPreset[];
  stack: StackChild[];
}

/** Body to pin/unpin an item as a Quick Capture favorite. */
export interface SetQuickLogBody {
  quickLog: boolean;
  quickOrder?: number | null;
  presets?: QuickPreset[];
}

export interface CreateIntake {
  displayName: string;
  itemId?: string;
  quantity: number;
  unit: string;
  occurredAt?: string;
  contextTags?: string[];
  source?: IntakeSource;
  precision?: IntakePrecision;
  unresolved?: boolean;
}

/** How an intake was captured (provenance, mirrors shared/inputs.ts). */
export type IntakeSource = "quick" | "recent" | "photo" | "voice" | "manual" | "api";

/** How exact an intake is (mirrors shared/inputs.ts). */
export type IntakePrecision = "precise" | "rough";

/** An item logged often enough to suggest pinning to Quick Capture. */
export interface FavoriteSuggestion extends InputItemSummary {
  count: number;
}

export interface Substance {
  id: string;
  name: string;
  substanceType: string;
  canonicalUnit: SubstanceUnit;
  aliases: string[];
}

export interface ComponentInput {
  substance?: string;
  childItemId?: string;
  amount: number;
  unit: string;
}

export interface CreateItemBody {
  name: string;
  kind: "product" | "recipe" | "simple" | "stack";
  defaultServing?: {
    displayQuantity?: number;
    displayUnit?: string;
    canonicalQuantity?: number;
    canonicalUnit?: string;
  };
  components?: ComponentInput[];
}

/** What the recognizer extracted from a photo/phrase (mirrors shared/inputs.ts). */
export interface RecognizedIntake {
  name: string;
  quantity: number;
  unit: string;
  draft: CreateItemBody;
  /** A time the user stated, as a local "YYYY-MM-DDTHH:MM"; absent if none. */
  when?: string;
}

/** Recognition + catalog match returned by POST /api/intake/recognize. */
export interface RecognizeResult {
  recognized: RecognizedIntake;
  matches: InputItemSummary[];
  transcript?: string;
}

/** One distinct recently-logged item (GET /api/intake/recent-items). */
export interface RecentItem {
  itemId: string | null;
  displayName: string;
  quantity: number;
  unit: string;
  lastLoggedAt: string;
}
